import { RpcExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
export declare class AllRpcExceptionsFilter implements RpcExceptionFilter<RpcException> {
    private readonly logger;
    catch(exception: any, host: ArgumentsHost): Observable<any>;
}
