import { Catch, RpcExceptionFilter, ArgumentsHost, Logger } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';

@Catch()
export class AllRpcExceptionsFilter implements RpcExceptionFilter<RpcException> {
  private readonly logger = new Logger(AllRpcExceptionsFilter.name);

  catch(exception: any, host: ArgumentsHost): Observable<any> {
    const error = exception instanceof RpcException ? exception.getError() : exception;
    const message = typeof error === 'object' ? error['message'] || exception.message : error || exception.message;

    // Log the gRPC error for observability
    this.logger.error(`gRPC Error: ${message}`, exception.stack);

    // Silent Bug Fix: Wrap in RpcException to ensure transport stability
    const rpcError = exception instanceof RpcException ? exception : new RpcException(error);
    return throwError(() => rpcError.getError());
  }
}
