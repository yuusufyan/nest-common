import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiResponse } from '../interfaces/response.interface';

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
    } else if (exception.name === 'QueryFailedError') {
      // Silent Bug Fix: Database errors should not leak raw SQL to users
      status = HttpStatus.BAD_REQUEST;
      message = 'Operation failed due to invalid data format or constraint violation.';
      details = process.env.NODE_ENV !== 'production' ? exception.message : null;
    } else if (exception instanceof Error) {
      message = exception.message;
    } else if (typeof exception === 'string') {
      message = exception;
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
