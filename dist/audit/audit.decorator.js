"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Audit = exports.AUDIT_METADATA_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.AUDIT_METADATA_KEY = 'audit_metadata';
const Audit = (options) => (0, common_1.SetMetadata)(exports.AUDIT_METADATA_KEY, options);
exports.Audit = Audit;
//# sourceMappingURL=audit.decorator.js.map