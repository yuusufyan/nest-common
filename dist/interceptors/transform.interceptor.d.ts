import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ApiResponse } from '../interfaces/response.interface';
export declare class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
    private readonly logger;
    intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>>;
    private safeData;
}
