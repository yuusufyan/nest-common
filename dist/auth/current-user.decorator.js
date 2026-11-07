"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentUser = void 0;
const common_1 = require("@nestjs/common");
exports.CurrentUser = (0, common_1.createParamDecorator)((key, context) => {
    const user = context.switchToHttp().getRequest().user;
    return key ? user?.[key] : user;
});
//# sourceMappingURL=current-user.decorator.js.map