"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateGeneralDto = exports.ResultTable = exports.GetTableDto = exports.ActiveStatus = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var ActiveStatus;
(function (ActiveStatus) {
    ActiveStatus["Active"] = "Active";
    ActiveStatus["Inactive"] = "Inactive";
})(ActiveStatus || (exports.ActiveStatus = ActiveStatus = {}));
class GetTableDto {
    constructor() {
        this.page = 1;
        this.limit = 10;
    }
}
exports.GetTableDto = GetTableDto;
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, default: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetTableDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, default: 10 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetTableDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetTableDto.prototype, "term", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetTableDto.prototype, "sortBy", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, enum: ['ASC', 'DESC'] }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GetTableDto.prototype, "orderBy", void 0);
class ResultTable {
}
exports.ResultTable = ResultTable;
class CreateGeneralDto {
}
exports.CreateGeneralDto = CreateGeneralDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ActiveStatus, default: ActiveStatus.Active }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateGeneralDto.prototype, "status", void 0);
//# sourceMappingURL=types.js.map