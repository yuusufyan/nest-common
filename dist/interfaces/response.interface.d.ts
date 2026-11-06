export interface ApiResponse<T> {
    code: number;
    status: 'success' | 'error';
    message: string;
    data: T;
    meta?: ApiMeta;
}
export interface ApiMeta {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    total_results: number;
}
export interface PaginatedData<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
}
