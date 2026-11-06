export declare const CIRCULAR_MARKER = "[Circular]";
export declare const MAX_DEPTH_MARKER = "[MaxDepth]";
export declare const TRUNCATED_MARKER = "[Truncated]";
export declare const stringTruncatedMarker: (originalLength: number) => string;
export declare class SafeJsonLimitError extends Error {
    constructor(message: string);
}
export interface SafeJsonOptions {
    maxNodes?: number;
    maxDepth?: number;
    maxStringLength?: number;
    bigint?: 'throw' | 'string';
    onNodeLimit?: 'throw' | 'truncate';
    dedupeRepeated?: boolean;
}
export declare function toSafeJson(value: any, options?: SafeJsonOptions): any;
