import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiResponse } from '../interfaces/response.interface';

// Fail closed: raw error text (hosts, SQL, stack hints) is only echoed to the
// client when the environment is explicitly a local one, never when NODE_ENV
// is 'production', unset, or anything unexpected.
function exposesInternalErrors(): boolean {
  return ['development', 'test'].includes(process.env.NODE_ENV ?? '');
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res: any = exception.getResponse();
      
      if (typeof res === 'object' && res !== null && 'message' in res) {
        // ValidationPipe returns message as an array of strings
        message = Array.isArray(res.message) ? res.message.join(', ') : res.message;
        details = res.error || null;
      } else {
        message = typeof res === 'string' ? res : res.message || exception.message;
      }

      // 5xx messages are often built from internal errors, e.g.
      // `new InternalServerErrorException(err.message)`; never echo them.
      if (status >= 500 && !exposesInternalErrors()) {
        message = 'Internal server error';
        details = null;
      }
    } else if (exception.name === 'QueryFailedError') {
      // Silent Bug Fix: Database errors should not leak raw SQL to users
      status = HttpStatus.BAD_REQUEST;
      message = 'Operation failed due to invalid data format or constraint violation.';
      details = exposesInternalErrors() ? exception.message : null;
    } else if (exception instanceof Error) {
      // Unknown errors (e.g. DB connection failures) may carry internal hosts.
      if (exposesInternalErrors()) message = exception.message;
    } else if (typeof exception === 'string') {
      if (exposesInternalErrors()) message = exception;
    } else {
      message = 'An unexpected error occurred';
    }

    // Standard Log (Optional: could use a logger service later)
    if (status >= 500) {
      console.error(`[Exception] ${status} - ${message}`, exception);
    }

    const errorResponse: ApiResponse<any> = {
      code: status,
      status: 'error',
      // Silent Bug Fix: Truncate massive error messages to prevent log bloat
      message: Array.isArray(message) 
        ? message.join(', ').substring(0, 1000) 
        : (message?.toString() || '').substring(0, 1000),
      data: details,
    };

    response.status(status).json(errorResponse);
  }
}
