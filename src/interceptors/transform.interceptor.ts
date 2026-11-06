import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/response.interface';
import {
  SafeJsonLimitError,
  stringTruncatedMarker,
  TRUNCATED_MARKER,
  toSafeJson,
} from '../shared/safe-json';

// Upper bound on objects/arrays copied into one response envelope. Far above
// any legitimate page (20k rows x ~10 nested objects = 200k), low enough to
// stop an exponential "diamond" graph early.
const SAFE_DATA_MAX_NODES = 500_000;

// Upper bound on any single string field in a response body. maxNodes alone
// never bounds this: a wide array/object of primitives is capped because
// each element costs a node, but one giant string (a base64 blob, an HTML
// export, a stack trace someone concatenated in a loop) is still just 1
// node no matter how many megabytes long it is, and previously sailed
// through untouched into res.json(). 1,000,000 chars (~1-2MB depending on
// encoding) is far above any legitimate single field (names, descriptions,
// even a full address) while still bounding worst-case memory/response size.
const SAFE_DATA_MAX_STRING_LENGTH = 1_000_000;

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  private readonly logger = new Logger(TransformInterceptor.name);

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest();
    // Prometheus scrapes /metrics expecting the raw text-exposition format
    // (Content-Type: text/plain; version=0.0.4) — wrapping it in the
    // {code,status,message,data} envelope would make it unparseable by
    // Prometheus, so this one route is deliberately never transformed.
    if (request?.path === '/metrics') {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse();
    const statusCode = response.statusCode || HttpStatus.OK;

    return next.handle().pipe(
      map((data) => {
        let meta;
        let payload = data;
        let message = data?.message || 'Request successful';

        if (data && typeof data === 'object') {
          // Check for unwrapped success standard response
          if (
            'code' in data && 
            'status' in data && 
            'message' in data && 
            (data.status === 'success' || data.status === 'error')
          ) {
            payload = data.data;
            
            // Check if there is pagination inside the wrapper
            if ('total' in data) {
              const total = data.total;
              const limit = data.limit || 10;
              const page = data.page || 1;
              meta = {
                total: total,
                page: page,
                limit: limit,
                total_pages: Math.ceil(total / limit),
                total_results: total,
              };
            }
          } else if ('meta' in data && 'data' in data && data.meta && 'total' in data.meta) {
            // Standard object with data and meta properties (from microservices)
            const total = data.meta.total;
            const limit = data.meta.limit || data.meta.per_page || 10;
            const page = data.meta.page || 1;
            meta = {
              total: total,
              page: page,
              limit: limit,
              total_pages: data.meta.last_page || Math.ceil(total / limit),
              total_results: total,
            };
            payload = data.data;
          } else if ('total' in data && 'data' in data) {
            // Raw pagination without success wrapper
            const total = data.total;
            const limit = data.limit || 10;
            const page = data.page || 1;
            meta = {
              total: total,
              page: page,
              limit: limit,
              total_pages: Math.ceil(total / limit),
              total_results: total,
            };
            payload = data.data;
          } else if ('recordsTotal' in data && 'data' in data) {
            // DataTables format without success wrapper
            const total = data.recordsTotal;
            // Assuming default limit as 10 since it's not provided in response
            const limit = 10;
            const page = 1;
            meta = {
              total: total,
              page: page,
              limit: limit,
              total_pages: Math.ceil(total / limit),
              total_results: total,
            };
            payload = data.data;
          } else if ('success' in data && 'data' in data) {
            // Ad-hoc {success, message, data} wrapper without pagination
            // (single create/update/delete/find-one responses, plain lists)
            payload = data.data;
          }
        }

        return {
          code: statusCode,
          status: 'success',
          message: message,
          data: this.safeData(payload, request?.path),
          meta: meta,
        };
      }),
    );
  }

  // Returns a plain, serializable copy of the payload -- equivalent to
  // JSON.parse(JSON.stringify(data)) (Date -> ISO string, toJSON() honoured,
  // undefined/functions dropped) -- where a true circular reference (e.g.
  // TypeORM parent <-> child) becomes the string '[Circular]' instead of
  // crashing res.json(). See toSafeJson for why cycles are tracked by
  // ancestor path (shared lookup objects must stay intact) and why there is
  // an object budget (non-circular "diamond" graphs grow exponentially).
  //
  // Over budget, it falls back to the legacy flat-set behaviour (every
  // repeated object -> '[Circular]'), which is bounded by the number of
  // distinct objects and matches what this interceptor returned before the
  // ancestor-path fix.
  private safeData(data: any, path?: string): any {
    // A bare top-level string payload never reaches toSafeJson below (it
    // short-circuits on the next line), so it needs its own size check here
    // -- otherwise a controller returning one huge string directly (an HTML
    // export, a report body) would bypass every guard in this method.
    if (typeof data === 'string' && data.length > SAFE_DATA_MAX_STRING_LENGTH) {
      this.logger.warn(
        `Response for ${path ?? 'unknown route'} was a ${data.length}-char string exceeding the ${SAFE_DATA_MAX_STRING_LENGTH}-char field limit; truncated`,
      );
      return stringTruncatedMarker(data.length);
    }
    if (!data || typeof data !== 'object') return data;

    const baseOptions = {
      maxNodes: SAFE_DATA_MAX_NODES,
      maxStringLength: SAFE_DATA_MAX_STRING_LENGTH,
      // Without this, a TypeORM bigint column (common for ids/amounts)
      // makes toSafeJson throw a plain TypeError that has
      // nothing to do with the object graph shape -- which used to slip
      // past the SafeJsonLimitError-only check below and skip the one
      // guard (cycle detection) this whole method exists to provide. See
      // audit-trail.service.ts's stringifyWithLimit, which already passes
      // this for the same reason.
      bigint: 'string' as const,
    };

    try {
      return toSafeJson(data, baseOptions);
    } catch (e) {
      // Whatever this was -- an over-budget object graph
      // (SafeJsonLimitError), or any OTHER unexpected serialization
      // failure -- the original, unprocessed `data` may still contain a
      // genuine circular reference (that's exactly what this method
      // exists to catch), so it must NEVER be returned as-is: doing so
      // would hand res.json() a value that can crash with an unhandled
      // "Converting circular structure to JSON" (or similar) TypeError
      // OUTSIDE this try/catch, defeating this method's entire purpose.
      // Every branch below therefore returns something that has been
      // through toSafeJson's safe dedupe/truncate mode, or a hard-coded
      // safe marker -- never the raw `data` -- regardless of which error
      // type got us here.
      if (e instanceof SafeJsonLimitError) {
        this.logger.warn(
          `Response for ${path ?? 'unknown route'} exceeded ${SAFE_DATA_MAX_NODES} objects when serialized; repeated references were replaced with '[Circular]'`,
        );
      } else {
        this.logger.warn(
          `Response for ${path ?? 'unknown route'} threw an unexpected error during safe serialization (${(e as Error)?.name ?? 'Error'}: ${(e as Error)?.message ?? e}); falling back to the legacy dedupe/truncate serializer`,
        );
      }
      try {
        return toSafeJson(data, {
          ...baseOptions,
          dedupeRepeated: true,
          onNodeLimit: 'truncate',
        });
      } catch (e2) {
        // The fallback itself is expected to be safe against everything
        // enumerated above (bigint, over-budget, cycles) -- if it STILL
        // throws, something genuinely unanticipated is going on (e.g. a
        // toJSON() that itself throws). Even then, never fall through to
        // the raw payload: return a hard-coded safe marker instead.
        this.logger.error(
          `Response for ${path ?? 'unknown route'} could not be safely serialized even by the fallback serializer (${(e2 as Error)?.message ?? e2}); replaced with a placeholder`,
        );
        return TRUNCATED_MARKER;
      }
    }
  }
}
