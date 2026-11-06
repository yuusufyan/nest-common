export declare enum AuditAction {
    CREATE = "CREATE",
    UPDATE = "UPDATE",
    DELETE = "DELETE",
    LOGIN = "LOGIN",
    LOGOUT = "LOGOUT",
    VIEW = "VIEW",
    EXPORT = "EXPORT",
    IMPORT = "IMPORT",
    DOWNLOAD = "DOWNLOAD"
}
export declare class AuditTrail {
    id: string;
    generateId(): void;
    user_id: string;
    username: string;
    table_name: string;
    record_id: string;
    action: AuditAction;
    old_values: string;
    new_values: string;
    ip_address: string;
    user_agent: string;
    description: string;
    created_at: Date;
}
