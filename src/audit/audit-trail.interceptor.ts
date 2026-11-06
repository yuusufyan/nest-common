import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { AUDIT_METADATA_KEY, AuditOptions } from './audit.decorator';
import { AuditTrailService } from './audit-trail.service';

// Masking fix (security audit): the original masking only ever looked at
// TOP-LEVEL keys of a shallow-spread copy. Three concrete leaks that came
// from that shape, all confirmed live before this fix:
//
// 1. A nested object or array element carrying a sensitive/PII key (e.g.
//    `{ profile: { password: 'x' } }`, or an array of user rows each with a
//    `token`) was never touched -- the plaintext value went into
//    `audit_trail.new_values` AND was republished verbatim onto the shared
//    `audit.events` RabbitMQ queue (every consuming service reads
//    that queue).
// 2. `{ ...auditData }` on an ARRAY body (e.g. a bulk-create endpoint's
//    `[{name,password},{token}]`) turns it into `{"0":{...},"1":{...}}` --
//    wrong shape for a reader expecting an array, and still unmasked in
//    that shape besides.
// 3. The Buffer/Stream check ran AFTER the object had already been spread,
//    so it could only ever match `auditData` itself, never a Buffer nested
//    one level down -- a PDF/file field on a DTO went into the audit row
//    byte-by-byte (`{"0":37,"1":80,...}`) instead of being recognized as
//    binary and redacted.
//
// maskAuditValue below recurses into plain objects and arrays, checks for
// binary-like values BEFORE spreading at every level (not just the top),
// and returns arrays as arrays (mapped element-by-element) instead of
// ever coercing them into an index-keyed object.

// Sensitive keys are matched by WHOLE WORD, not raw substring: the previous
// substring check (`lowerKey.includes('pass')`) was both too broad (false
// positives: `passport_no`, `compass_heading` both contain "pass" as a
// substring but are not passwords) and, being substring-only, still missed
// nothing extra -- it just matched too much AND too little at once. Keys
// are split on camelCase/snake_case/kebab-case boundaries (`newPassword` ->
// ['new','password'], `no_rekening` -> ['no','rekening']) and each WHOLE
// word is checked against the lists below, so `passport` (one word, never
// split into `pass`+`port`) never collides with `pass`/`password`.
const SENSITIVE_WORDS = new Set([
  'password',
  'passwd',
  'pwd',
  'pass',
  'secret',
  'token',
  'credential',
  'credentials',
]);

// PII fields: previously there was no PII list at all, so plainly personal
// data (email, phone numbers, national ID, bank account) went into the
// audit trail and the cross-service `audit.events` queue completely
// unmasked. Field-name conventions below (nik, no_rekening/rekening,
// no_hp/no_telp, alamat, npwp) match the field-name conventions
// consuming services' own entities actually use.
const PII_WORDS = new Set([
  'email',
  'phone',
  'hp',
  'telp',
  'nik',
  'npwp',
  'rekening',
  'alamat',
]);

// Bank/account-number fields are only sensitive as a PAIR of words -- a
// generic "account" word alone is far too broad to mask on its own (would
// also catch `account_id`, `account_status`, `account_holder_name`,
// `account_balance`, all real non-secret fields), but
// paired with a "number" word it unambiguously means a bank account
// number. Originally this only matched the exact compound string
// `account_number`, which missed `account_no`/`accountNo` -- real,
// currently-@Audit-decorated column spellings confirmed live in consuming
// services' own entities (`account_no`) -- so those bank account
// numbers were logged in plaintext to audit_trail and the shared
// audit.events queue. A per-word-PAIR check (rather than an ever-growing
// list of exact compound strings) catches any ACCOUNT_WORD + NUMBER_WORD
// combination regardless of order/separator, so `account_no`, `accountNo`,
// `account_number`, `no_account`, etc. are all covered without adding a
// new generic single word to SENSITIVE_WORDS/PII_WORDS that would over-mask
// the non-sensitive `account_*` fields above. `rekening` is unaffected by
// this (already a whole-word PII match on its own, since unlike "account"
// it isn't used for any non-sensitive field).
const ACCOUNT_WORDS = new Set(['account']);
const NUMBER_WORDS = new Set(['no', 'num', 'number']);

function hasSensitiveWordPair(words: string[]): boolean {
  const hasAccountWord = words.some((w) => ACCOUNT_WORDS.has(w));
  const hasNumberWord = words.some((w) => NUMBER_WORDS.has(w));
  return hasAccountWord && hasNumberWord;
}

// Recursion guard: bounds worst-case work/stack depth on a pathological or
// maliciously deep payload. Far beyond any legitimate DTO
// shape. Reaching the cap redacts the ENTIRE remaining subtree (see
// maskAuditValue) rather than returning it untouched -- see MAX_DEPTH_MARKER
// fix note below for why.
const MAX_MASK_DEPTH = 20;

// Returned for the whole subtree once MAX_MASK_DEPTH is hit. Kept distinct
// from '[BINARY DATA - NOT LOGGED]' (a different, non-security reason for
// substitution) but following this file's existing bracketed-reason marker
// convention (see safe-json.ts's MAX_DEPTH_MARKER for the same idea at the
// JSON-safety layer).
export const MAX_MASK_DEPTH_MARKER = '[REDACTED - MAX DEPTH]';

function toWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isSensitiveKey(key: string): boolean {
  const words = toWords(key);
  if (hasSensitiveWordPair(words)) return true;
  return words.some((w) => SENSITIVE_WORDS.has(w) || PII_WORDS.has(w));
}

export function isBinaryLike(value: unknown): boolean {
  return (
    Buffer.isBuffer(value) ||
    ArrayBuffer.isView(value) ||
    value instanceof ArrayBuffer ||
    (!!value &&
      typeof value === 'object' &&
      typeof (value as any).pipe === 'function')
  );
}

export function maskAuditValue(value: any, depth = 0): any {
  // Binary-like values are checked FIRST, before any spreading/recursion --
  // this is what item 3 above fixes: a Buffer nested inside the payload is
  // now caught at the level it actually appears at, not just at the root.
  if (isBinaryLike(value)) {
    return '[BINARY DATA - NOT LOGGED]';
  }

  // Bug fix: this previously did `return value;` -- returning the RAW,
  // completely unmasked subtree once the depth cap was hit, instead of
  // stopping the recursion safely. Confirmed live: a sensitive key (e.g.
  // `password`) nested past MAX_MASK_DEPTH levels came out in PLAINTEXT in
  // the final masked output, defeating the entire point of this function
  // for any deeply-nested (attacker- or buggy-client-controlled, since
  // `request.body` drives this) payload. The cap must fail CLOSED: redact
  // the whole remaining subtree rather than let anything past it through
  // in its original form.
  if (depth >= MAX_MASK_DEPTH) return MAX_MASK_DEPTH_MARKER;

  if (Array.isArray(value)) {
    // Mapped element-by-element -- never spread into `{...value}`, which is
    // what previously corrupted an array body into an index-keyed object.
    return value.map((item) => maskAuditValue(item, depth + 1));
  }

  if (value instanceof Date) return value;

  if (value && typeof value === 'object') {
    const masked: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      masked[key] = isSensitiveKey(key)
        ? '********'
        : maskAuditValue((value as Record<string, any>)[key], depth + 1);
    }
    return masked;
  }

  return value;
}

@Injectable()
export class AuditTrailInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private auditTrailService: AuditTrailService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditOptions = this.reflector.get<AuditOptions>(
      AUDIT_METADATA_KEY,
      context.getHandler(),
    );

    if (!auditOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    return next.handle().pipe(
      tap(async (data) => {
        // Bug fix: a handler using @Res() that manually calls
        // `res.status(400).json(...)` (instead of throwing an
        // HttpException, which the exception filter -- and therefore the
        // catchError branch below -- would handle) never throws, so this
        // `tap` always ran and unconditionally recorded 'SUCCESS' no matter
        // what status code the handler actually sent. Confirmed live in
        // liquidity-service's master-cash-flow.controller.ts and ~10
        // similar @Res()-style controllers there: every one of those error
        // responses was audited as [SUCCESS] with a NULL record_id.
        // Reading the real response.statusCode here (the same object the
        // handler wrote to) is the only way to see the true outcome for
        // this pattern; a thrown exception still goes through catchError
        // below exactly as before.
        const response = context.switchToHttp().getResponse();
        const status = response?.statusCode >= 400 ? 'FAILED' : 'SUCCESS';
        await this.logAudit(user, request, auditOptions, data, status);
      }),
      catchError((err) => {
        // Fire-and-forget logic to ensure error is not swallowed by RxJS
        this.logAudit(user, request, auditOptions, err, 'FAILED').catch(e => console.error(e));
        return throwError(() => err);
      }),
    );
  }

  // Bug fix: record_id was never populated -- every audit_trail row across
  // every service using @Audit() has always had a null record_id, making a
  // CREATE/UPDATE/DELETE row impossible to tie back to a specific database
  // row after the fact (confirmed live in liquidity-service; this class is
  // shared, so the same gap applies everywhere @Audit() is used).
  //
  // Route params are the most reliable source -- present on every
  // update/delete route regardless of what the response body happens to
  // contain, and unaffected by param naming (":id", ":profilRisiko", ...).
  // A nested resource path's LAST param is the leaf record actually being
  // acted on (e.g. "/parents/:parentId/children/:id" -> the child's id).
  // Falls back to an id on the response body only for the SUCCESS path --
  // on the FAILED path there is no response body to read (`data` is the
  // thrown error), so route params are the only source available.
  private extractRecordId(request: any, data: any, status: string): string | undefined {
    const paramValues = Object.values(request.params || {});
    if (paramValues.length > 0) {
      const last = paramValues[paramValues.length - 1];
      if (typeof last === 'string' || typeof last === 'number') {
        return String(last);
      }
    }

    if (status === 'SUCCESS' && data && typeof data === 'object') {
      // TransformInterceptor's envelope ({ code, status, message, data })
      // when it runs before this interceptor's tap (the common case),
      // otherwise the controller's raw return value.
      const entity = 'data' in data ? data.data : data;
      if (entity && typeof entity === 'object' && !Array.isArray(entity)) {
        const id = (entity as any).id;
        if (typeof id === 'string' || typeof id === 'number') {
          return String(id);
        }
      }
    }

    return undefined;
  }

  private async logAudit(user: any, request: any, options: AuditOptions, data: any, status: string) {
    try {
      const recordId = this.extractRecordId(request, data, status);

      // Logic Fix: For write operations, log the request body as new_values
      const isWriteOp = ['POST', 'PUT', 'PATCH'].includes(request.method);
      let auditData = isWriteOp ? request.body : data;

      // Masking fix: recurse into nested objects/arrays, mask
      // Buffer/Stream values before they get spread at any level, and keep
      // array shape intact. See maskAuditValue's doc comment above for the
      // three concrete leaks this replaces.
      auditData = maskAuditValue(auditData);

      await this.auditTrailService.log({
        user_id: user?.id,
        username: user?.username || user?.email,
        table_name: options.tableName.toLowerCase(), // Normalization Fix
        record_id: recordId,
        action: options.action,
        description: `[${status}] ${options.description || ''}`,
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
        new_values: auditData,
      });
    } catch (error) {
      console.error('Failed to save audit trail:', error);
    }
  }
}
