export declare enum ActiveStatus {
    Active = "Active",
    Inactive = "Inactive"
}
export declare class GetTableDto {
    page: number;
    limit: number;
    term?: string;
    sortBy?: string;
    orderBy?: 'ASC' | 'DESC';
    [key: string]: any;
}
export declare class ResultTable {
    data: any[];
    totalItems: number;
    total?: number;
    page: number;
    perPage: number;
    totalPages: number;
    limit?: number;
}
export declare class CreateGeneralDto {
    status?: ActiveStatus;
}
