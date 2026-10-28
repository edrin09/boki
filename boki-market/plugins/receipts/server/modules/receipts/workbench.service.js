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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceiptWorkbenchService = void 0;
const common_1 = require("@nestjs/common");
const receipt_entity_1 = require("@core/entities/receipt.entity");
const classify_rule_entity_1 = require("@core/entities/classify-rule.entity");
const account_entity_1 = require("@core/entities/account.entity");
const department_entity_1 = require("@core/entities/department.entity");
const hr_entity_1 = require("@core/entities/hr.entity");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const voucher_entry_entity_1 = require("@core/entities/voucher-entry.entity");
const enums_1 = require("@core/common/enums");
const money_util_1 = require("@core/common/utils/money.util");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const vouchers_service_1 = require("@core/modules/vouchers/vouchers.service");
const employee_settlement_service_1 = require("@plugin/hr/server/modules/loans/employee-settlement.service");
const expense_claims_service_1 = require("@plugin/hr/server/modules/expense-claims/expense-claims.service");
const folder_intent_util_1 = require("./folder-intent.util");
const party_sync_service_1 = require("./party-sync.service");
const classify_service_1 = require("./classify.service");
const filename_util_1 = require("@core/common/utils/filename.util");
/**
 * 待确认工作台（P17.4 / P17.6）：
 * 草稿生成（复用凭证服务，借贷平衡）、修改科目、确认入账、驳回、修正回写。
 */
let ReceiptWorkbenchService = class ReceiptWorkbenchService {
    receiptRepo;
    ruleRepo;
    accountRepo;
    deptRepo;
    employeeRepo;
    voucherRepo;
    entryRepo;
    classify;
    vouchers;
    partySync;
    settlementService;
    expenseClaims;
    logger = new common_1.Logger('ReceiptWorkbenchService');
    /** 兜底部门缓存（同一批次内复用，避免每条分录重复查询） */
    cachedDefaultDept;
    constructor(receiptRepo, ruleRepo, accountRepo, deptRepo, employeeRepo, voucherRepo, entryRepo, classify, vouchers, partySync, settlementService, expenseClaims) {
        this.receiptRepo = receiptRepo;
        this.ruleRepo = ruleRepo;
        this.accountRepo = accountRepo;
        this.deptRepo = deptRepo;
        this.employeeRepo = employeeRepo;
        this.voucherRepo = voucherRepo;
        this.entryRepo = entryRepo;
        this.classify = classify;
        this.vouchers = vouchers;
        this.partySync = partySync;
        this.settlementService = settlementService;
        this.expenseClaims = expenseClaims;
    }
    // ==================== 查询 ====================
    /** 待确认列表：已解析 + 已生成草稿（展示建议与草稿分录，不计数命中） */
    async pendingList(query) {
        const page = Math.max(1, query.page ?? 1);
        const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
        const qb = this.receiptRepo
            .createQueryBuilder('r')
            .where('r.status IN (:...statuses)', {
            statuses: [enums_1.ReceiptStatus.PARSED, enums_1.ReceiptStatus.DRAFTED],
        })
            .orderBy('r.createdAt', 'DESC');
        const [rows, total] = await qb
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();
        const items = [];
        for (const r of rows)
            items.push(await this.enrich(r));
        return { list: items, total, page, pageSize };
    }
    /** 工作台详情（含归类建议与凭证草稿） */
    async detail(id) {
        const receipt = await this.findEntity(id);
        return this.enrich(receipt);
    }
    // ==================== 草稿 ====================
    /** 生成/覆盖凭证草稿：归类 → 解析科目与对手方 → 复用凭证服务创建（不审核） */
    async generateDraft(id, operator) {
        const receipt = await this.findEntity(id);
        this.assertDraftable(receipt);
        const suggestion = await this.classify.suggest(receipt);
        if (!suggestion.entries.length) {
            throw new common_1.BadRequestException(suggestion.message ?? '该票据无法自动归类，请完善公司信息或归类规则');
        }
        // 购销双方识别信息同步入库往来单位（按纳税人识别号去重；旧票重生成时也补齐），失败不阻断凭证
        try {
            await this.partySync.syncBoth(this.parseFields(receipt));
        }
        catch (err) {
            this.logger.warn(`票据 ${id} 往来单位同步失败: ${err.message}`);
        }
        // 目录归属员工（采购/报销目录 + 在职员工）→ 改走报销单流程：
        // 有未还清借款先生成「冲抵借款型」，票额超出/无借款的部分生成「直接付款型」；
        // 目录判不出归属人等情况返回 null，回落到原凭证草稿流程
        const folderClaims = await this.tryCreateFolderClaims(receipt, suggestion, operator);
        if (folderClaims) {
            receipt.status = enums_1.ReceiptStatus.DRAFTED;
            await this.receiptRepo.save(receipt);
            return this.detail(id);
        }
        const { rows: entries, isRed } = await this.buildEntries(receipt, suggestion);
        const voucherDate = receipt.issueDate ?? new Date().toISOString().slice(0, 10);
        const fileName = (0, filename_util_1.recoverFilename)(receipt.fileName) ?? receipt.fileName;
        // 冲销原因写入 remark（凭证列表「备注/补充信息」展示）：
        // 能取到被冲销的原蓝字发票号码时关联原发票，否则保持「红字发票红冲（文件名）」文案
        const origNo = isRed ? this.str(this.parseFields(receipt).original_invoice_no) : '';
        const remark = isRed
            ? origNo
                ? `红冲原发票：原发票号码 ${origNo}`
                : `红字发票红冲（${fileName}）`
            : `票据自动生成（${fileName}）`;
        if (receipt.voucherId) {
            const linked = await this.voucherRepo.findOne({ where: { id: receipt.voucherId } });
            if (linked && linked.status !== enums_1.VoucherStatus.DRAFT) {
                throw new common_1.BadRequestException('关联凭证已审核或作废，不能重新生成草稿');
            }
            await this.vouchers.update(linked.id, { word: enums_1.VoucherWord.GENERAl, voucherDate, entries, remark }, operator, false);
        }
        else {
            const voucher = await this.vouchers.create({ word: enums_1.VoucherWord.GENERAl, voucherDate, entries, remark }, operator, false);
            receipt.voucherId = voucher.id;
        }
        // 红字发票 → 红冲凭证：标记 isReversal，与手工红字冲销口径一致（列表展示「红冲」标记）
        if (isRed && receipt.voucherId) {
            await this.voucherRepo.update({ id: receipt.voucherId }, { isReversal: true });
        }
        receipt.status = enums_1.ReceiptStatus.DRAFTED;
        await this.receiptRepo.save(receipt);
        return this.detail(id);
    }
    /** 修改草稿分录（改科目/改金额），仅草稿状态可改 */
    async updateDraft(id, dto, operator) {
        const receipt = await this.findEntity(id);
        if (receipt.status !== enums_1.ReceiptStatus.DRAFTED || !receipt.voucherId) {
            throw new common_1.BadRequestException('请先生成凭证草稿');
        }
        const linked = await this.voucherRepo.findOne({ where: { id: receipt.voucherId } });
        if (!linked || linked.status !== enums_1.VoucherStatus.DRAFT) {
            throw new common_1.BadRequestException('关联凭证状态异常，无法修改');
        }
        const voucherDate = dto.voucherDate ?? receipt.issueDate ?? linked.voucherDate;
        await this.vouchers.update(linked.id, { word: enums_1.VoucherWord.GENERAl, voucherDate, entries: dto.entries, remark: linked.remark }, operator, false);
        return this.detail(id);
    }
    // ==================== 确认 / 驳回 ====================
    /** 确认入账：审核关联草稿凭证/报销单 + 状态流转 + 修正回写 */
    async confirm(id, operator) {
        const receipt = await this.findEntity(id);
        if (receipt.status !== enums_1.ReceiptStatus.DRAFTED || (!receipt.voucherId && !receipt.claimIds)) {
            throw new common_1.BadRequestException('该票据没有待确认的凭证草稿，请先生成草稿');
        }
        // 目录归属员工流程：审核关联报销单（报销单审核时生成并审核凭证、登记借款核销）
        if (receipt.claimIds) {
            let mainVoucherId = null;
            for (const cid of this.claimIdListOf(receipt)) {
                const claim = await this.expenseClaims.findOne(cid).catch(() => null);
                if (!claim)
                    continue;
                if (claim.status === enums_1.ExpenseClaimStatus.DRAFT) {
                    const approved = await this.expenseClaims.approve(cid, operator);
                    if (!mainVoucherId)
                        mainVoucherId = approved.voucherId ?? null;
                }
                else if (claim.status === enums_1.ExpenseClaimStatus.REJECTED) {
                    throw new common_1.BadRequestException(`关联报销单 ${claim.claimNo} 已驳回，请重新生成草稿后再确认`);
                }
                else if (!mainVoucherId) {
                    mainVoucherId = claim.voucherId ?? null;
                }
            }
            receipt.status = enums_1.ReceiptStatus.CONFIRMED;
            receipt.confirmedBy = operator.id;
            receipt.confirmedByName = operator.nickname;
            receipt.confirmedAt = new Date();
            if (mainVoucherId)
                receipt.voucherId = mainVoucherId;
            await this.receiptRepo.save(receipt);
            return this.detail(id);
        }
        const linked = await this.voucherRepo.findOne({ where: { id: receipt.voucherId } });
        if (!linked || linked.status !== enums_1.VoucherStatus.DRAFT) {
            throw new common_1.BadRequestException('关联凭证状态异常，无法确认入账');
        }
        await this.vouchers.approve(linked.id, operator);
        receipt.status = enums_1.ReceiptStatus.CONFIRMED;
        receipt.confirmedBy = operator.id;
        receipt.confirmedByName = operator.nickname;
        receipt.confirmedAt = new Date();
        await this.receiptRepo.save(receipt);
        // P17.6：确认前用户改过科目 → 按交易对手自动记入规则
        await this.learnFromCorrection(receipt);
        return this.detail(id);
    }
    /** 批量确认（逐条独立，部分失败不影响其他） */
    async confirmBatch(ids, operator) {
        const results = [];
        for (const id of ids) {
            try {
                await this.confirm(id, operator);
                results.push({ id, success: true, message: '已确认入账' });
            }
            catch (err) {
                results.push({ id, success: false, message: err.message });
            }
        }
        const success = results.filter((r) => r.success).length;
        return { success, failed: results.length - success, results };
    }
    /** 驳回：删除草稿凭证（如有）并标记不生成凭证 */
    async reject(id, dto) {
        const receipt = await this.findEntity(id);
        if (receipt.status === enums_1.ReceiptStatus.CONFIRMED) {
            throw new common_1.BadRequestException('该票据已确认入账，不能驳回');
        }
        if (receipt.status === enums_1.ReceiptStatus.REJECTED) {
            throw new common_1.BadRequestException('该票据已驳回');
        }
        if (receipt.status !== enums_1.ReceiptStatus.PARSED && receipt.status !== enums_1.ReceiptStatus.DRAFTED) {
            throw new common_1.BadRequestException('当前状态不支持驳回');
        }
        // 目录归属员工流程：删除草稿报销单（已审核的报销单要求先在报销单中处理）
        if (receipt.claimIds) {
            for (const cid of this.claimIdListOf(receipt)) {
                const claim = await this.expenseClaims.findOne(cid).catch(() => null);
                if (!claim)
                    continue;
                if (claim.status === enums_1.ExpenseClaimStatus.DRAFT) {
                    await this.expenseClaims.remove(cid);
                }
                else if (claim.status !== enums_1.ExpenseClaimStatus.REJECTED) {
                    throw new common_1.BadRequestException(`关联报销单 ${claim.claimNo} 已审核，请先在报销单中删除后再驳回`);
                }
            }
            receipt.claimIds = null;
        }
        if (receipt.voucherId) {
            const linked = await this.voucherRepo.findOne({ where: { id: receipt.voucherId } });
            if (linked) {
                if (linked.status === enums_1.VoucherStatus.DRAFT) {
                    await this.vouchers.remove(linked.id);
                }
                else {
                    throw new common_1.BadRequestException('关联凭证已审核，请先反审核或通过红冲处理');
                }
            }
        }
        receipt.status = enums_1.ReceiptStatus.REJECTED;
        receipt.rejectReason = dto.reason ?? null;
        receipt.rejectedAt = new Date();
        receipt.voucherId = null;
        await this.receiptRepo.save(receipt);
        return this.detail(id);
    }
    // ==================== 内部 ====================
    /** 按模板生成分录：科目编码→ID、对手方找/建往来单位、金额解析并强制借贷平衡 */
    async buildEntries(receipt, suggestion) {
        const fields = this.parseFields(receipt);
        let total = this.num(fields.total_amount)
            ?? ((this.num(fields.amount) ?? 0) + (this.num(fields.tax_amount) ?? 0));
        let tax = this.num(fields.tax_amount) ?? 0;
        // 红字发票（红冲）：票面金额为负数。按系统红冲凭证口径处理：
        // 金额取绝对值、借贷方向整体对调（凭证由调用方标记 isReversal）。
        const isRed = this.isRedInvoice(fields, total);
        if (isRed) {
            total = Math.abs(total);
            tax = Math.abs(tax);
        }
        const net = total - tax;
        const rows = [];
        for (const tpl of suggestion.entries) {
            const account = await this.requireLeafAccount(tpl.accountCode);
            const amount = this.resolveAmount(tpl.amountSource, fields, { total, net, tax });
            const direction = isRed
                ? tpl.direction === 'debit' ? 'credit' : 'debit'
                : tpl.direction;
            const partnerId = await this.resolvePartner(suggestion, tpl, receipt);
            // 科目要求部门辅助核算时兜底填一个默认部门：
            // 票据本身通常不含部门信息，但缺少它会让整张凭证无法保存
            const departmentId = (account.auxiliaryTypes ?? []).includes(enums_1.AuxiliaryType.DEPARTMENT)
                ? await this.defaultDepartmentId()
                : null;
            rows.push({
                summary: (tpl.summary ?? '').slice(0, 200),
                accountId: account.id,
                partnerId,
                departmentId,
                amount: (0, money_util_1.fromCents)((0, money_util_1.toCents)(Math.abs(amount))),
                direction,
            });
        }
        // 差额修正到第一条主分录（费用/收入），保证草稿通过平衡校验
        let debit = 0;
        let credit = 0;
        for (const r of rows) {
            if (r.direction === 'debit')
                debit += (0, money_util_1.toCents)(r.amount);
            else
                credit += (0, money_util_1.toCents)(r.amount);
        }
        const diff = credit - debit;
        if (diff !== 0 && rows.length) {
            const target = rows.find((r) => r.direction === 'debit') ??
                rows.find((r) => r.direction === 'credit') ??
                rows[0];
            const next = (0, money_util_1.toCents)(target.amount) + (target.direction === 'debit' ? diff : -diff);
            target.amount = (0, money_util_1.fromCents)(Math.max(0, next));
        }
        return {
            rows: rows.map((r) => ({
                summary: r.summary,
                accountId: r.accountId,
                partnerId: r.partnerId ?? undefined,
                departmentId: r.departmentId ?? undefined,
                debit: r.direction === 'debit' ? r.amount : undefined,
                credit: r.direction === 'credit' ? r.amount : undefined,
            })),
            isRed,
        };
    }
    // ==================== 目录归属员工 → 报销单 ====================
    /**
     * 归属员工的采购/报销票改走报销单流程（取代旧的直接拆贷方 1221 出凭证）。
     *
     * 财务口径：员工借款采购后拿票报销 → 借 库存/费用（+进项税）/ 贷 其他应收款-员工，
     * 不能既冲借款又付现金（重复付款）。归属员工解析优先级：
     * 1. 目录命名「采购单|报销/员工名/」；
     * 2. 个人抬头自动判定（买方命中在职员工，classify.suggestion.ownerName）。
     * 按归属员工：
     * - 有未还清借款：先生成「冲抵借款型」报销单（min(票额, 欠款总额)，审核时 FIFO 冲减借款）；
     * - 票额超出欠款或无借款：超出部分生成「直接付款型」报销单（垫付挂账，审核后付款给员工）。
     * 红字发票不参与冲抵，仍走原凭证流程。
     *
     * @returns 生成的报销单列表；判不出归属员工/归类无借方明细时返回 null（走凭证流程）
     */
    async tryCreateFolderClaims(receipt, suggestion, operator) {
        const folder = (0, folder_intent_util_1.parseFolderIntent)(receipt.folderPath);
        const folderOwner = folder.purpose === 'purchase' || folder.purpose === 'expense' ? folder.ownerName : null;
        const ownerName = folderOwner ?? suggestion.ownerName ?? null;
        if (!ownerName)
            return null;
        const employee = await this.employeeRepo.findOne({
            where: { name: ownerName, status: enums_1.EmployeeStatus.ON_JOB },
        });
        if (!employee)
            return null;
        // 红字发票不冲抵（红冲方向相反，应由人工处理）
        const fields = this.parseFields(receipt);
        const total = this.num(fields.total_amount) ?? (this.num(fields.amount) ?? 0) + (this.num(fields.tax_amount) ?? 0);
        if (this.isRedInvoice(fields, total))
            return null;
        const items = await this.buildClaimItems(receipt, suggestion);
        if (!items.length)
            return null;
        // 重新生成前校验：关联报销单/凭证必须仍在草稿态
        await this.assertDraftArtifactsReplaceable(receipt);
        // 员工未还清借款总额（分）
        const balances = await this.settlementService.outstandingMapByEmployees([employee.id]);
        const outstandingCents = (0, money_util_1.toCents)(balances.get(employee.id) ?? 0);
        const totalCents = items.reduce((sum, i) => sum + (0, money_util_1.toCents)(i.amount), 0);
        if (totalCents <= 0)
            return null;
        const fileName = (0, filename_util_1.recoverFilename)(receipt.fileName) ?? receipt.fileName;
        const baseRemark = (folderOwner
            ? `目录「${folder.raw || folder.purposeLabel}」导入（${fileName}）`
            : `个人抬头票（买方 ${ownerName}）导入（${fileName}）`).slice(0, 180);
        const claimDate = receipt.issueDate ?? new Date().toISOString().slice(0, 10);
        const claims = [];
        // 1) 先冲抵借款：票额与未还清借款取小，生成冲抵借款型报销单（审核时贷 1221、FIFO 核销）
        const offsetCents = Math.min(totalCents, Math.max(0, outstandingCents));
        if (offsetCents > 0) {
            claims.push(await this.expenseClaims.create({
                claimDate,
                employeeId: employee.id,
                payMethod: 'advance',
                claimType: 'loan_offset',
                items: this.scaleClaimItems(items, offsetCents),
                remark: `${baseRemark}，冲抵借款`,
            }, operator));
        }
        // 2) 超出借款（或无借款）的部分：直接付款型报销单（员工垫付挂账，审核后付款给员工）
        const restCents = totalCents - offsetCents;
        if (restCents > 0) {
            claims.push(await this.expenseClaims.create({
                claimDate,
                employeeId: employee.id,
                payMethod: 'advance',
                claimType: 'payment',
                items: this.scaleClaimItems(items, restCents),
                remark: offsetCents > 0 ? `${baseRemark}，超出借款部分待付员工` : baseRemark,
            }, operator));
        }
        // 替换旧草稿后指向新报销单
        await this.clearDraftArtifacts(receipt);
        receipt.claimIds = JSON.stringify(claims.map((c) => c.id));
        receipt.voucherId = null;
        return claims;
    }
    /**
     * 从归类模板提取报销单费用明细（仅借方行：库存/费用/进项税），
     * 并把合计校正到价税合计（尾差摊到第一条非税行）。
     */
    async buildClaimItems(receipt, suggestion) {
        const fields = this.parseFields(receipt);
        const total = this.num(fields.total_amount) ?? (this.num(fields.amount) ?? 0) + (this.num(fields.tax_amount) ?? 0);
        const tax = this.num(fields.tax_amount) ?? 0;
        const net = total - tax;
        const items = [];
        for (const tpl of suggestion.entries) {
            if (tpl.direction !== 'debit')
                continue;
            const account = await this.requireLeafAccount(tpl.accountCode);
            const amount = Math.abs(this.resolveAmount(tpl.amountSource, fields, { total, net, tax }));
            if (amount <= 0)
                continue;
            items.push({
                summary: (tpl.summary || suggestion.counterparty || '').slice(0, 200),
                accountId: account.id,
                amount: (0, money_util_1.fromCents)((0, money_util_1.toCents)(amount)),
                isTax: tpl.amountSource === 'tax_amount',
            });
        }
        if (!items.length)
            return [];
        const sum = items.reduce((s, i) => s + (0, money_util_1.toCents)(i.amount), 0);
        const diff = (0, money_util_1.toCents)(total) - sum;
        if (diff !== 0) {
            const target = items.find((i) => !i.isTax) ?? items[0];
            target.amount = (0, money_util_1.fromCents)(Math.max(0, (0, money_util_1.toCents)(target.amount) + diff));
        }
        return items;
    }
    /** 按目标金额（分）等比拆分明细，尾差落在最后一行（报销单拆分冲抵/付款两段时用） */
    scaleClaimItems(items, targetCents) {
        const totalCents = items.reduce((s, i) => s + (0, money_util_1.toCents)(i.amount), 0);
        let used = 0;
        const rows = items.map((item, idx) => {
            let cents;
            if (idx === items.length - 1) {
                cents = targetCents - used;
            }
            else {
                cents = Math.floor(((0, money_util_1.toCents)(item.amount) * targetCents) / totalCents);
            }
            used += cents;
            return { summary: item.summary, accountId: item.accountId, amount: (0, money_util_1.fromCents)(cents) };
        });
        return rows.filter((r) => (0, money_util_1.toCents)(r.amount) > 0);
    }
    /** 重新生成前校验：关联报销单不能已审核/已付款，关联凭证必须还是草稿 */
    async assertDraftArtifactsReplaceable(receipt) {
        if (receipt.claimIds) {
            for (const cid of this.claimIdListOf(receipt)) {
                const claim = await this.expenseClaims.findOne(cid).catch(() => null);
                if (claim &&
                    (claim.status === enums_1.ExpenseClaimStatus.APPROVED || claim.status === enums_1.ExpenseClaimStatus.PAID)) {
                    throw new common_1.BadRequestException(`关联报销单 ${claim.claimNo} 已审核，不能重新生成草稿；请先在报销单中删除`);
                }
            }
        }
        if (receipt.voucherId) {
            const linked = await this.voucherRepo.findOne({ where: { id: receipt.voucherId } });
            if (linked && linked.status !== enums_1.VoucherStatus.DRAFT) {
                throw new common_1.BadRequestException('关联凭证已审核或作废，不能重新生成草稿');
            }
        }
    }
    /** 清掉旧草稿：删除草稿态报销单与草稿凭证（已审核的报销单/凭证由校验先行拦截） */
    async clearDraftArtifacts(receipt) {
        if (receipt.claimIds) {
            for (const cid of this.claimIdListOf(receipt)) {
                const claim = await this.expenseClaims.findOne(cid).catch(() => null);
                if (claim && claim.status === enums_1.ExpenseClaimStatus.DRAFT) {
                    await this.expenseClaims.remove(cid);
                }
            }
            receipt.claimIds = null;
        }
        if (receipt.voucherId) {
            const linked = await this.voucherRepo.findOne({ where: { id: receipt.voucherId } });
            if (linked && linked.status === enums_1.VoucherStatus.DRAFT) {
                await this.vouchers.remove(linked.id);
            }
            receipt.voucherId = null;
        }
    }
    /** 解析票据上关联的报销单ID列表（JSON 数组，容错解析） */
    claimIdListOf(receipt) {
        if (!receipt.claimIds)
            return [];
        try {
            const arr = JSON.parse(receipt.claimIds);
            return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
        }
        catch {
            return [];
        }
    }
    /** 红字发票判定：识别字段 is_red=1（票面含「红字」/号码带负数后缀），或价税合计为负数 */
    isRedInvoice(fields, total) {
        const flag = fields.is_red;
        if (flag !== null && flag !== undefined && String(flag) === '1')
            return true;
        return total < 0;
    }
    /**
     * 解析分录金额。
     * 优先按 amountSource 直接取识别字段（支持工资表等业务字段）；
     * 取不到时回落到发票口径：tax_amount→税额、amount→不含税、其余→价税合计。
     */
    resolveAmount(source, fields, ctx) {
        const direct = this.num(fields[source]);
        if (direct !== null)
            return direct;
        if (source === 'tax_amount')
            return ctx.tax;
        if (source === 'amount')
            return ctx.net;
        return ctx.total;
    }
    /** 解析分录上的往来单位：按纳税人识别号优先命中去重，命中只回填空字段，不覆盖手工填写 */
    async resolvePartner(suggestion, tpl, receipt) {
        if (!tpl.partnerField)
            return null;
        const name = (suggestion.counterparty ?? '').trim();
        if (!name)
            return null;
        const isBuyer = tpl.partnerField === 'buyer_name';
        const p = this.parseFields(receipt);
        const pfx = isBuyer ? 'buyer_' : 'seller_';
        return this.partySync.syncParty({
            name: this.str(p[pfx + 'name']) || name,
            taxNo: p[pfx + 'tax_no'],
            address: p[pfx + 'address'],
            phone: p[pfx + 'phone'],
            bank: p[pfx + 'bank'],
            bankAccount: p[pfx + 'bank_account'],
        }, isBuyer ? 'buyer' : 'seller');
    }
    /**
     * 兜底部门：取当前公司第一个启用中的部门。
     * 票据识别不出部门，但「销售费用/研发费用」等科目要求按部门辅助核算，
     * 缺部门会导致整张凭证保存失败，因此这里给一个默认值。
     */
    async defaultDepartmentId() {
        if (this.cachedDefaultDept !== undefined)
            return this.cachedDefaultDept;
        try {
            const dept = await this.deptRepo.findOne({ where: { status: 1 }, order: { code: 'ASC' } });
            this.cachedDefaultDept = dept?.id ?? null;
        }
        catch {
            this.cachedDefaultDept = null;
        }
        return this.cachedDefaultDept;
    }
    async requireLeafAccount(code) {
        const account = await this.accountRepo.findOne({ where: { code } });
        if (!account)
            throw new common_1.BadRequestException(`草稿科目「${code}」不存在，请在会计科目中维护或调整归类规则`);
        if (!account.isLeaf) {
            throw new common_1.BadRequestException(`草稿科目「${account.fullName}」不是明细科目，不能记账`);
        }
        if (account.status !== 1) {
            throw new common_1.BadRequestException(`草稿科目「${account.fullName}」已禁用`);
        }
        return account;
    }
    assertDraftable(receipt) {
        if (receipt.status === enums_1.ReceiptStatus.CONFIRMED) {
            throw new common_1.BadRequestException('该票据已确认入账，不能重新生成草稿');
        }
        if (receipt.status === enums_1.ReceiptStatus.REJECTED) {
            throw new common_1.BadRequestException('该票据已驳回，如需重新处理请重新上传');
        }
        if (receipt.status !== enums_1.ReceiptStatus.PARSED && receipt.status !== enums_1.ReceiptStatus.DRAFTED) {
            throw new common_1.BadRequestException('当前状态不支持生成凭证草稿');
        }
    }
    /**
     * P17.6 修正回写：确认入账时若主分录科目与默认建议不同，
     * 按交易对手（partner 规则）记入/更新规则，下次自动命中。
     */
    async learnFromCorrection(receipt) {
        try {
            const suggestion = await this.classify.suggest(receipt, { countHit: false });
            if (!suggestion.entries.length || !suggestion.account)
                return;
            const counterparty = (suggestion.counterparty ?? '').trim();
            if (!counterparty)
                return;
            const linked = await this.voucherRepo.findOne({ where: { id: receipt.voucherId } });
            if (!linked)
                return;
            const entries = await this.entryRepo.find({ where: { voucherId: linked.id }, order: { sort: 'ASC' } });
            const main = entries[0];
            if (!main || main.accountCode === suggestion.account.code)
                return; // 未修正，无需回写
            const key = counterparty.slice(0, 100);
            const existed = await this.ruleRepo.findOne({ where: { matchType: 'partner', matchValue: key } });
            if (existed) {
                if (existed.targetAccountCode !== main.accountCode) {
                    existed.targetAccountCode = main.accountCode;
                    existed.learned = true;
                    await this.ruleRepo.save(existed);
                }
                return;
            }
            await this.ruleRepo.save(this.ruleRepo.create({
                ruleName: `${key} 归类（自动学习）`,
                matchType: 'partner',
                matchValue: key,
                kind: suggestion.kind === 'output_vat' ? 'income' : 'expense',
                targetAccountCode: main.accountCode,
                priority: 50,
                enabled: 1,
                hitCount: 0,
                learned: true,
            }));
        }
        catch (err) {
            this.logger.warn(`修正回写失败: ${err.message}`);
        }
    }
    /** 展示视图：基础信息 + 识别字段 + 归类建议 + 凭证草稿 */
    async enrich(receipt) {
        let suggestion = null;
        try {
            suggestion = await this.classify.suggest(receipt, { countHit: false });
        }
        catch {
            suggestion = null;
        }
        let draft = null;
        if (receipt.voucherId) {
            try {
                const voucher = await this.vouchers.findOne(receipt.voucherId);
                if (voucher) {
                    draft = {
                        id: voucher.id,
                        voucherNo: voucher.voucherNo,
                        word: voucher.word,
                        voucherDate: voucher.voucherDate,
                        status: voucher.status,
                        entries: (voucher.entries ?? []).map((e) => ({
                            id: e.id,
                            summary: e.summary,
                            accountId: e.accountId,
                            accountCode: e.accountCode,
                            accountName: e.accountName,
                            partnerId: e.partnerId,
                            employeeId: e.employeeId,
                            employeeName: e.employeeName,
                            debit: e.debit,
                            credit: e.credit,
                            sort: e.sort,
                        })),
                    };
                }
            }
            catch {
                draft = null;
            }
        }
        // 目录归属员工流程：带出关联报销单（含类型/金额/状态）供工作台展示
        const claims = [];
        if (receipt.claimIds) {
            for (const cid of this.claimIdListOf(receipt)) {
                const claim = await this.expenseClaims.findOne(cid).catch(() => null);
                if (claim)
                    claims.push(claim);
            }
        }
        return {
            id: receipt.id,
            fileName: (0, filename_util_1.recoverFilename)(receipt.fileName) ?? receipt.fileName,
            mimeType: receipt.mimeType,
            receiptType: receipt.receiptType,
            receiptTypeName: receipt.receiptTypeName,
            storagePath: receipt.storagePath,
            confidence: receipt.confidence,
            status: receipt.status,
            bookable: receipt.bookable === null ? null : Boolean(receipt.bookable),
            blockReason: receipt.blockReason ?? null,
            issueDate: receipt.issueDate,
            amount: receipt.amount,
            taxAmount: receipt.taxAmount,
            invoiceCode: receipt.invoiceCode,
            invoiceNo: receipt.invoiceNo,
            sellerName: receipt.sellerName,
            buyerName: receipt.buyerName,
            sellerTaxNo: receipt.sellerTaxNo,
            buyerTaxNo: receipt.buyerTaxNo,
            rejectReason: receipt.rejectReason,
            confirmedByName: receipt.confirmedByName,
            confirmedAt: receipt.confirmedAt,
            rejectedAt: receipt.rejectedAt,
            voucherId: receipt.voucherId,
            createdAt: receipt.createdAt,
            fields: this.parseFieldsArray(receipt),
            suggestion,
            draft,
            claims,
        };
    }
    parseFields(receipt) {
        const map = {};
        for (const f of this.parseFieldsArray(receipt))
            map[f.key] = f.value;
        return map;
    }
    parseFieldsArray(receipt) {
        if (!receipt.structured)
            return [];
        try {
            const parsed = JSON.parse(receipt.structured);
            return parsed.fields ?? [];
        }
        catch {
            return [];
        }
    }
    num(v) {
        if (v === null || v === undefined)
            return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    str(v) {
        if (v === null || v === undefined)
            return '';
        return String(v).trim();
    }
    async findEntity(id) {
        const receipt = await this.receiptRepo.findOne({ where: { id } });
        if (!receipt)
            throw new common_1.NotFoundException('票据不存在');
        return receipt;
    }
};
exports.ReceiptWorkbenchService = ReceiptWorkbenchService;
exports.ReceiptWorkbenchService = ReceiptWorkbenchService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(receipt_entity_1.Receipt)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(classify_rule_entity_1.ClassifyRule)),
    __param(2, (0, company_repo_decorator_1.InjectCompanyRepo)(account_entity_1.Account)),
    __param(3, (0, company_repo_decorator_1.InjectCompanyRepo)(department_entity_1.Department)),
    __param(4, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Employee)),
    __param(5, (0, company_repo_decorator_1.InjectCompanyRepo)(voucher_entity_1.Voucher)),
    __param(6, (0, company_repo_decorator_1.InjectCompanyRepo)(voucher_entry_entity_1.VoucherEntry)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        classify_service_1.ClassifyService,
        vouchers_service_1.VouchersService,
        party_sync_service_1.PartySyncService,
        employee_settlement_service_1.EmployeeSettlementService,
        expense_claims_service_1.ExpenseClaimsService])
], ReceiptWorkbenchService);
