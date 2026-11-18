<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <PeriodPicker v-model="period" width="150px" />
        <el-select v-model="query.status" placeholder="凭证状态" clearable style="width: 120px" @change="search">
          <el-option label="未审核" value="draft" />
          <el-option label="已审核" value="approved" />
          <el-option label="已作废" value="cancelled" />
        </el-select>
        <el-input
          v-model="query.keyword"
          placeholder="搜索摘要 / 科目 / 备注"
          clearable
          style="width: 200px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="onReset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'voucher:create'" type="primary" @click="router.push('/voucher/create')">
          <el-icon><Plus /></el-icon>新增凭证
        </el-button>
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
      </div>

      <!-- 凭证列表（按凭证分组展示分录） -->
      <div v-loading="loading">
        <el-empty v-if="!loading && list.length === 0" description="暂无凭证数据" />

        <div v-for="voucher in list" :key="voucher.id" class="voucher-card">
          <div class="voucher-card__head">
            <div class="voucher-card__no">
              <el-tag v-if="voucher.isReversal" type="danger" size="small">红冲</el-tag>
              <el-tag :type="voucherStatusMeta(voucher.status).type" size="small">
                {{ voucherStatusMeta(voucher.status).label }}
              </el-tag>
              <span class="voucher-card__word">{{ voucher.word }}</span>
              <span class="voucher-card__no-text">
                第 {{ pad(voucher.voucherNo) }} 号
              </span>
              <span class="voucher-card__date">{{ formatDate(voucher.voucherDate) }}</span>
            </div>
            <div class="voucher-card__actions">
              <el-button
                v-if="canReverse(voucher)"
                v-permission="'voucher:reverse'"
                link
                type="danger"
                @click="onReverse(voucher)"
              >
                红冲
              </el-button>
              <el-button
                v-if="voucher.reversedById"
                link
                type="info"
                disabled
              >
                已红冲
              </el-button>
              <el-button v-permission="'voucher:copy'" link type="primary" @click="onCopy(voucher)">
                复制
              </el-button>
              <el-button
                v-if="voucher.status === 'draft'"
                v-permission="'voucher:approve'"
                link
                type="success"
                @click="onApprove(voucher)"
              >
                审核
              </el-button>
              <el-button
                v-if="voucher.status === 'approved'"
                v-permission="'voucher:unapprove'"
                link
                type="warning"
                @click="onUnapprove(voucher)"
              >
                反审核
              </el-button>
              <el-button
                v-if="voucher.status !== 'cancelled'"
                v-permission="'voucher:cancel'"
                link
                type="info"
                @click="onCancel(voucher)"
              >
                作废
              </el-button>
              <el-button
                v-if="voucher.status !== 'cancelled'"
                v-permission="'voucher:update'"
                link
                type="primary"
                @click="onEdit(voucher)"
              >
                修改
              </el-button>
              <el-button
                v-if="voucher.status === 'draft'"
                v-permission="'voucher:delete'"
                link
                type="danger"
                @click="onRemove(voucher)"
              >
                删除
              </el-button>
            </div>
          </div>

          <el-table :data="voucher.entries ?? []" size="small" class="voucher-card__table">
            <el-table-column type="index" label="#" width="50" align="center" />
            <el-table-column prop="summary" label="摘要" min-width="180" />
            <el-table-column label="会计科目" min-width="200">
              <template #default="{ row }">
                {{ row.accountCode }} {{ row.accountName }}
              </template>
            </el-table-column>
            <el-table-column label="辅助核算" min-width="150">
              <template #default="{ row }">
                <span v-if="!row.partnerId && !row.departmentId && !row.projectId && !row.employeeId">
                  -
                </span>
                <el-tooltip v-if="row.partnerId" content="点击查看往来单位档案" placement="top">
                  <el-tag size="small" class="aux-tag aux-tag--link" @click="openAux('partner', row.partnerId, row.partnerName)">
                    {{ row.partnerName }}
                  </el-tag>
                </el-tooltip>
                <el-tag v-if="row.departmentId" size="small" class="aux-tag">{{ row.departmentName }}</el-tag>
                <el-tooltip v-if="row.projectId" content="点击查看项目档案与关联合同" placement="top">
                  <el-tag size="small" class="aux-tag aux-tag--link" @click="openAux('project', row.projectId, row.projectName)">
                    {{ row.projectName }}
                  </el-tag>
                </el-tooltip>
                <el-tooltip v-if="row.employeeId" content="点击查看员工档案" placement="top">
                  <el-tag v-if="row.employeeId" size="small" type="warning" class="aux-tag aux-tag--link" @click="openAux('employee', row.employeeId, row.employeeName)">
                    {{ row.employeeName || '员工' }}
                  </el-tag>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="借方金额" width="140" align="right">
              <template #default="{ row }">
                <span class="amount amount--debit">{{ row.debit ? formatAmount(row.debit) : '' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="贷方金额" width="140" align="right">
              <template #default="{ row }">
                <span class="amount amount--credit">{{ row.credit ? formatAmount(row.credit) : '' }}</span>
              </template>
            </el-table-column>
          </el-table>

          <div class="voucher-card__foot">
            <span>制单：{{ voucher.createdByName || '-' }}</span>
            <span v-if="voucher.approvedByName">审核：{{ voucher.approvedByName }}</span>
            <span v-if="voucher.remark" class="voucher-card__remark">备注：{{ voucher.remark }}</span>
            <span v-if="voucher.sourceReceipt" class="voucher-card__receipt">
              <el-icon><Paperclip /></el-icon>
              <span class="link" @click="openReceiptPreview(voucher)">
                原始票据：{{ voucher.sourceReceipt.fileName }}
              </span>
            </span>
            <div class="voucher-card__totals">
              <span>借方合计 <b class="amount amount--debit">{{ formatAmount(voucher.debitTotal) }}</b></span>
              <span>贷方合计 <b class="amount amount--credit">{{ formatAmount(voucher.creditTotal) }}</b></span>
            </div>
          </div>
        </div>
      </div>

      <AppPagination
        v-if="list.length > 0"
        v-model:page="query.page"
        v-model:page-size="query.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @change="load"
        @size-change="handleSize"
      />
    </div>

    <!-- 原始票据预览（复用票据预览逻辑：PDF 用 iframe，图片用 el-image） -->
    <el-dialog v-model="receiptVisible" :title="receiptName" width="720px" destroy-on-close @closed="onReceiptClosed">
      <iframe v-if="receiptIsPdf && receiptUrl" :src="receiptUrl" style="width: 100%; height: 70vh; border: none" />
      <el-image
        v-else-if="receiptUrl"
        :src="receiptUrl"
        fit="contain"
        style="width: 100%; max-height: 70vh"
        :preview-src-list="[receiptUrl]"
      />
    </el-dialog>

    <!-- 辅助核算档案抽屉：点分录上的往来单位 / 项目 / 员工标签进入 -->
    <el-drawer v-model="auxDrawer.visible" :title="auxTitle" size="820px" destroy-on-close>
      <div v-loading="auxDrawer.loading" class="aux-drawer__body">
        <!-- 往来单位（公司）档案 -->
        <template v-if="auxDrawer.kind === 'partner' && auxDrawer.data">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="编码">{{ auxDrawer.data.code || '-' }}</el-descriptions-item>
            <el-descriptions-item label="名称">{{ auxDrawer.data.name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="类型">{{ partnerTypeLabel(auxDrawer.data.type) }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.taxNo" label="税号">{{ auxDrawer.data.taxNo }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.legalPerson" label="法定代表人">{{ auxDrawer.data.legalPerson }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.contact" label="联系人">{{ auxDrawer.data.contact }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.phone" label="电话">{{ auxDrawer.data.phone }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.email" label="邮箱">{{ auxDrawer.data.email }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.address" label="地址">{{ auxDrawer.data.address }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.bankName || auxDrawer.data.bankAccount" label="开户行 / 账号">
              {{ [auxDrawer.data.bankName, auxDrawer.data.bankAccount].filter(Boolean).join(' / ') || '-' }}
            </el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.remark" label="备注">{{ auxDrawer.data.remark }}</el-descriptions-item>
          </el-descriptions>
          <div class="aux-drawer__hint">往来单位信息在「基础资料 - 往来单位」中维护</div>
        </template>

        <!-- 员工档案 -->
        <template v-if="auxDrawer.kind === 'employee' && auxDrawer.data">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="工号">{{ auxDrawer.data.code || '-' }}</el-descriptions-item>
            <el-descriptions-item label="姓名">{{ auxDrawer.data.name || '-' }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.position" label="岗位">{{ auxDrawer.data.position }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.departmentName" label="部门">{{ auxDrawer.data.departmentName }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.phone" label="电话">{{ auxDrawer.data.phone }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.hireDate" label="入职日期">{{ auxDrawer.data.hireDate }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.leaveDate" label="离职日期">{{ auxDrawer.data.leaveDate }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.baseSalary" label="基本工资（月）">{{ formatAmount(auxDrawer.data.baseSalary) }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.bankName || auxDrawer.data.bankAccount" label="开户行 / 卡号">
              {{ [auxDrawer.data.bankName, auxDrawer.data.bankAccount].filter(Boolean).join(' / ') || '-' }}
            </el-descriptions-item>
          </el-descriptions>
          <div class="aux-drawer__hint">员工信息在「人事」插件中维护</div>
        </template>

        <!-- 项目档案 + 关联合同 -->
        <template v-if="auxDrawer.kind === 'project' && auxDrawer.data">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="编码">{{ auxDrawer.data.code || '-' }}</el-descriptions-item>
            <el-descriptions-item label="名称">{{ auxDrawer.data.name || '-' }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.partnerName" label="客户">
              <el-link type="primary" :underline="false" @click="openAux('partner', auxDrawer.data.partnerId, auxDrawer.partnerName)">
                {{ auxDrawer.partnerName }}
              </el-link>
            </el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.manager" label="负责人">{{ auxDrawer.data.manager }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.contractNo" label="合同编号">{{ auxDrawer.data.contractNo }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.contractAmount" label="合同金额">{{ formatAmount(auxDrawer.data.contractAmount) }}</el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.startDate || auxDrawer.data.endDate" label="项目周期">
              {{ [auxDrawer.data.startDate, auxDrawer.data.endDate].filter(Boolean).join(' ~ ') }}
            </el-descriptions-item>
            <el-descriptions-item v-if="auxDrawer.data.remark" label="备注">{{ auxDrawer.data.remark }}</el-descriptions-item>
          </el-descriptions>

          <div class="aux-drawer__section-title">
            关联合同
            <span class="aux-drawer__section-sub">合同关联项目、项目关联账目</span>
          </div>
          <div v-if="auxDrawer.contractsState === 'loading'" v-loading="true" class="aux-drawer__loading" />
          <template v-else-if="auxDrawer.contractsState === 'ok'">
            <el-empty
              v-if="auxDrawer.contracts.length === 0"
              description="该项目暂无登记的合同"
              :image-size="60"
            />
            <el-table v-else :data="auxPage(auxDrawer.contracts, 'contracts')" size="small" border>
              <el-table-column prop="code" label="编码" width="80" />
              <el-table-column prop="name" label="合同名称" min-width="140" show-overflow-tooltip />
              <el-table-column label="合同金额" width="100" align="right">
                <template #default="{ row }">{{ formatAmount(row.contractAmount) }}</template>
              </el-table-column>
              <el-table-column label="预收/应收" width="120" align="right">
                <template #default="{ row }">
                  <span v-if="row.summary">
                    预收 {{ formatAmount(row.summary.advanceReceived) }} / 应收 {{ formatAmount(row.summary.receivable) }}
                  </span>
                  <span v-else>-</span>
                </template>
              </el-table-column>
              <el-table-column label="原件" width="90" align="center">
                <template #default="{ row }">
                  <el-button v-if="row.hasFile" link type="primary" size="small" @click="onAuxContractPreview(row)">预览</el-button>
                  <span v-else class="aux-drawer__muted">未上传</span>
                </template>
              </el-table-column>
            </el-table>
            <AppPagination
              v-model:page="auxPager.contracts.page"
              v-model:page-size="auxPager.contracts.pageSize"
              :total="auxDrawer.contracts.length"
              :page-sizes="AUX_PAGE_SIZES"
              layout="total, sizes, prev, pager, next"
              size="small"
              align="left"
              hide-on-single-page
              class="aux-pager"
            />
          </template>
          <div v-else-if="auxDrawer.contractsState === 'denied'" class="aux-drawer__hint">
            当前角色无合同管理权限或未安装合同插件，无法显示关联合同
          </div>
        </template>

        <!-- ===== 历史业务：光看档案没用，要看这家单位 / 这个人发生过什么 ===== -->
        <div v-if="auxDrawer.kind" class="aux-history">
          <div class="aux-drawer__section-title">
            往来汇总
            <span class="aux-drawer__section-sub">与本档案相关的全部业务单据</span>
          </div>
          <div class="aux-summary">
            <span class="aux-summary__item">
              相关凭证 <b>{{ auxDrawer.history.vouchers.length }}</b> 张
              <em>借 {{ formatAmount(auxDrawer.history.totals.debit) }} / 贷 {{ formatAmount(auxDrawer.history.totals.credit) }}</em>
            </span>
            <span v-if="auxDrawer.kind !== 'employee'" class="aux-summary__item">
              收款 <b>{{ formatAmount(auxFlowTotals.receipt) }}</b>
              <em>{{ auxFlowTotals.receiptCount }} 笔</em>
            </span>
            <span v-if="auxDrawer.kind !== 'employee'" class="aux-summary__item">
              付款 <b>{{ formatAmount(auxFlowTotals.payment) }}</b>
              <em>{{ auxFlowTotals.paymentCount }} 笔</em>
            </span>
            <span v-if="auxDrawer.kind === 'employee'" class="aux-summary__item">
              借款 <b>{{ formatAmount(auxLoanTotals.amount) }}</b>
              <em>未还 {{ formatAmount(auxLoanTotals.outstanding) }}</em>
            </span>
            <span v-if="auxDrawer.kind === 'employee'" class="aux-summary__item">
              报销 <b>{{ formatAmount(auxClaimTotal) }}</b>
              <em>{{ auxDrawer.history.claims.length }} 笔</em>
            </span>
          </div>

          <!-- 收付款单（往来单位 / 项目） -->
          <template v-if="auxDrawer.kind !== 'employee'">
            <div class="aux-drawer__section-title">收付款单 <span class="aux-drawer__section-sub">来自「现金银行」，点金额看摘要</span></div>
            <el-empty v-if="auxDrawer.history.cashFlows.length === 0" description="暂无收付款单据" :image-size="52" />
            <el-table v-else :data="auxPage(auxDrawer.history.cashFlows, 'cashFlows')" size="small" border>
              <el-table-column prop="bizDate" label="日期" width="100" />
              <el-table-column label="类型" width="86">
                <template #default="{ row }">
                  <el-tag :type="AUX_BIZ_TAG[row.bizType] ?? 'info'" size="small">
                    {{ AUX_BIZ_TYPES[row.bizType] ?? row.bizType }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="金额" width="110" align="right">
                <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
              </el-table-column>
              <el-table-column prop="summary" label="摘要" min-width="150" show-overflow-tooltip />
              <el-table-column prop="bankAccountName" label="资金账户" min-width="110" show-overflow-tooltip />
              <el-table-column label="凭证" width="72" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row.voucherId" type="success" size="small">已生成</el-tag>
                  <span v-else class="aux-drawer__muted">-</span>
                </template>
              </el-table-column>
            </el-table>
            <AppPagination
              v-if="auxDrawer.history.cashFlows.length > 0"
              v-model:page="auxPager.cashFlows.page"
              v-model:page-size="auxPager.cashFlows.pageSize"
              :total="auxDrawer.history.cashFlows.length"
              :page-sizes="AUX_PAGE_SIZES"
              layout="total, sizes, prev, pager, next"
              size="small"
              align="left"
              hide-on-single-page
              class="aux-pager"
            />
          </template>

          <!-- 借款单（员工） -->
          <template v-if="auxDrawer.kind === 'employee'">
            <div class="aux-drawer__section-title">借款单 <span class="aux-drawer__section-sub">备用金 / 差旅费借款</span></div>
            <el-empty v-if="auxDrawer.history.loans.length === 0" description="暂无借款单" :image-size="52" />
            <el-table v-else :data="auxPage(auxDrawer.history.loans, 'loans')" size="small" border>
              <el-table-column prop="loanNo" label="单号" width="110" />
              <el-table-column prop="loanDate" label="日期" width="100" />
              <el-table-column label="借款金额" width="100" align="right">
                <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
              </el-table-column>
              <el-table-column label="已还 / 未还" width="130" align="right">
                <template #default="{ row }">
                  {{ formatAmount(row.repaidAmount) }} / <b>{{ formatAmount(row.outstanding) }}</b>
                </template>
              </el-table-column>
              <el-table-column prop="reason" label="事由" min-width="120" show-overflow-tooltip />
              <el-table-column label="状态" width="80" align="center">
                <template #default="{ row }">
                  <el-tag size="small" :type="AUX_STATUS_TAG[row.status] ?? 'info'">
                    {{ AUX_LOAN_STATUS[row.status] ?? row.status }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
            <AppPagination
              v-if="auxDrawer.history.loans.length > 0"
              v-model:page="auxPager.loans.page"
              v-model:page-size="auxPager.loans.pageSize"
              :total="auxDrawer.history.loans.length"
              :page-sizes="AUX_PAGE_SIZES"
              layout="total, sizes, prev, pager, next"
              size="small"
              align="left"
              hide-on-single-page
              class="aux-pager"
            />
          </template>

          <!-- 报销单（员工） -->
          <template v-if="auxDrawer.kind === 'employee'">
            <div class="aux-drawer__section-title">报销单 <span class="aux-drawer__section-sub">含冲抵借款的报销</span></div>
            <el-empty v-if="auxDrawer.history.claims.length === 0" description="暂无报销单" :image-size="52" />
            <el-table v-else :data="auxPage(auxDrawer.history.claims, 'claims')" size="small" border>
              <el-table-column prop="claimNo" label="单号" width="110" />
              <el-table-column prop="claimDate" label="日期" width="100" />
              <el-table-column label="金额" width="100" align="right">
                <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
              </el-table-column>
              <el-table-column label="方式" width="130" show-overflow-tooltip>
                <template #default="{ row }">
                  {{ row.claimType === 'loan_offset' ? `冲抵借款${row.loanNo ? ` ${row.loanNo}` : ''}` : '直接付款' }}
                </template>
              </el-table-column>
              <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
              <el-table-column label="状态" width="80" align="center">
                <template #default="{ row }">
                  <el-tag size="small" :type="AUX_STATUS_TAG[row.status] ?? 'info'">
                    {{ AUX_CLAIM_STATUS[row.status] ?? row.status }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
            <AppPagination
              v-if="auxDrawer.history.claims.length > 0"
              v-model:page="auxPager.claims.page"
              v-model:page-size="auxPager.claims.pageSize"
              :total="auxDrawer.history.claims.length"
              :page-sizes="AUX_PAGE_SIZES"
              layout="total, sizes, prev, pager, next"
              size="small"
              align="left"
              hide-on-single-page
              class="aux-pager"
            />
          </template>

          <!-- 工资发放（员工） -->
          <template v-if="auxDrawer.kind === 'employee' && auxDrawer.history.payrolls.length > 0">
            <div class="aux-drawer__section-title">工资发放 <span class="aux-drawer__section-sub">应发 / 实发</span></div>
            <el-table :data="auxPage(auxDrawer.history.payrolls, 'payrolls')" size="small" border>
              <el-table-column label="工资期间" width="100">
                <template #default="{ row }">{{ periodLabel(row.period) }}</template>
              </el-table-column>
              <el-table-column prop="payDate" label="发放日期" width="100" />
              <el-table-column label="应发" width="100" align="right">
                <template #default="{ row }">{{ formatAmount(row.gross) }}</template>
              </el-table-column>
              <el-table-column label="借款扣回" width="100" align="right">
                <template #default="{ row }">{{ formatAmount(row.loanDeduct) }}</template>
              </el-table-column>
              <el-table-column label="实发" width="110" align="right">
                <template #default="{ row }"><b>{{ formatAmount(row.net) }}</b></template>
              </el-table-column>
              <el-table-column label="状态" width="80" align="center">
                <template #default="{ row }">
                  <el-tag size="small" :type="AUX_STATUS_TAG[row.status] ?? 'info'">
                    {{ AUX_PAYROLL_STATUS[row.status] ?? row.status }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
            <AppPagination
              v-model:page="auxPager.payrolls.page"
              v-model:page-size="auxPager.payrolls.pageSize"
              :total="auxDrawer.history.payrolls.length"
              :page-sizes="AUX_PAGE_SIZES"
              layout="total, sizes, prev, pager, next"
              size="small"
              align="left"
              hide-on-single-page
              class="aux-pager"
            />
          </template>

          <!-- 相关凭证（展开看分录） -->
          <div class="aux-drawer__section-title">
            相关凭证
            <span class="aux-drawer__section-sub">点行首箭头展开该凭证的全部分录</span>
          </div>
          <el-empty v-if="auxDrawer.history.vouchers.length === 0" description="暂无相关凭证" :image-size="52" />
          <el-table
            v-else
            :data="auxPage(auxDrawer.history.vouchers, 'vouchers')"
            row-key="id"
            size="small"
            border
          >
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="aux-voucher-entries">
                  <div v-for="(e, i) in row.entries" :key="i" class="aux-voucher-entries__line">
                    <span class="aux-voucher-entries__summary">{{ e.summary || '-' }}</span>
                    <span class="aux-voucher-entries__account">{{ e.accountCode }} {{ e.accountName }}</span>
                    <span class="aux-voucher-entries__amount">
                      <em v-if="e.debit">借 {{ formatAmount(e.debit) }}</em>
                      <em v-if="e.credit">贷 {{ formatAmount(e.credit) }}</em>
                    </span>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="voucherDate" label="日期" width="100" />
            <el-table-column label="凭证号" width="150">
              <template #default="{ row }">
                <span>{{ row.word }}-{{ pad(row.voucherNo) }}</span>
                <el-tag v-if="row.isReversal" type="danger" size="small" class="aux-reversal-tag">红冲</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="摘要" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">{{ row.entries[0]?.summary || row.remark || '-' }}</template>
            </el-table-column>
            <el-table-column label="借方" width="105" align="right">
              <template #default="{ row }">{{ row.debit ? formatAmount(row.debit) : '' }}</template>
            </el-table-column>
            <el-table-column label="贷方" width="105" align="right">
              <template #default="{ row }">{{ row.credit ? formatAmount(row.credit) : '' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="76" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="voucherStatusMeta(row.status).type">
                  {{ voucherStatusMeta(row.status).label }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
          <AppPagination
            v-if="auxDrawer.history.vouchers.length > 0"
            v-model:page="auxPager.vouchers.page"
            v-model:page-size="auxPager.vouchers.pageSize"
            :total="auxDrawer.history.vouchers.length"
            :page-sizes="AUX_PAGE_SIZES"
            layout="total, sizes, prev, pager, next"
            size="small"
            align="left"
            hide-on-single-page
            class="aux-pager"
          />

          <div v-if="auxDrawer.historyState === 'denied'" class="aux-drawer__hint">
            历史单据加载失败（可能是权限不足），档案信息仍可查看
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- 关联合同原件预览（同票据预览：PDF iframe / 图片直显） -->
    <el-dialog v-model="contractPreview.visible" :title="contractPreview.title" width="860px" top="4vh" destroy-on-close @closed="onContractPreviewClosed">
      <div v-loading="contractPreview.loading" class="aux-contract-preview__body">
        <iframe v-if="contractPreview.url && contractPreview.isPdf" :src="contractPreview.url" style="width: 100%; height: 70vh; border: none" />
        <el-image
          v-else-if="contractPreview.url"
          :src="contractPreview.url"
          fit="contain"
          style="width: 100%; max-height: 70vh"
          :preview-src-list="[contractPreview.url]"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Download, Paperclip } from '@element-plus/icons-vue'
import { voucherApi, receiptApi, partnerApi, employeeApi, projectApi, pluginApi, get, download as downloadFile } from '@/api'
import service from '@/api/http'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { exportExcel } from '@/utils/export'
import { currentPeriod, formatAmount, formatDate, voucherStatusMeta } from '@/utils/format'
import { useUserStore } from '@/stores/user'
import AppPagination from '@/components/common/AppPagination.vue'
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
/** 已审核凭证改数必须走「反审核 → 改 → 重新审核」，没权限就别把人带到死胡同 */
const canUnapprove = computed(
  () => userStore.hasRole('admin') || userStore.hasPermission('voucher:unapprove'),
)

/**
 * 支持外部带筛选跳进来（如语音助手执行完「查看草稿凭证」）：
 * `/voucher/list?status=draft&period=202611`
 */
function queryPeriod(): number | undefined {
  const raw = route.query.period
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n >= 190001 && n <= 999912 ? n : undefined
}

function queryStatus(): string {
  const raw = String(route.query.status ?? '')
  return ['draft', 'approved', 'cancelled'].includes(raw) ? raw : ''
}

const period = ref<number>(queryPeriod() ?? currentPeriod())

const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
  // 注意：keyword 走后端 keyword（摘要/科目/备注模糊匹配），不要映射成 word，
  // word 是「凭证字」（记/收/付）精确等值，映射过去会让搜索永远查不到数据
  fetcher: (params) => voucherApi.list({ ...params, period: period.value }),
  defaultParams: {
    page: 1,
    pageSize: 20,
    status: queryStatus(),
    keyword: String(route.query.keyword ?? ''),
  },
})

function pad(n: number): string {
  return String(n ?? 0).padStart(4, '0')
}

function onReset() {
  query.value.status = ''
  query.value.keyword = ''
  reset()
}

watch(period, () => {
  query.value.page = 1
  load()
})

/** 已经在凭证列表页时再次带参数跳进来（只改 query），同步筛选条件 */
watch(
  () => route.fullPath,
  () => {
    const nextPeriod = queryPeriod()
    if (nextPeriod && nextPeriod !== period.value) {
      period.value = nextPeriod
      return
    }
    query.value.status = queryStatus()
    query.value.page = 1
    load()
  },
)

async function onApprove(voucher: any) {
  try {
    await ElMessageBox.confirm(
      `确认审核「${voucher.word} 第 ${pad(voucher.voucherNo)} 号」凭证吗？审核后将计入账簿与报表。`,
      '审核凭证',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await voucherApi.approve(voucher.id)
    ok('审核成功')
    load()
  } catch {
    /* 错误已提示 */
  }
}

async function onUnapprove(voucher: any) {
  try {
    await ElMessageBox.confirm('确认反审核该凭证吗？反审核后将不再计入账簿与报表。', '反审核', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await voucherApi.unapprove(voucher.id)
    ok('反审核成功')
    load()
  } catch {
    /* 错误已提示 */
  }
}

async function onCancel(voucher: any) {
  let reason = ''
  try {
    const res = await ElMessageBox.prompt('请输入作废原因（可选）', '作废凭证', {
      confirmButtonText: '确认作废',
      cancelButtonText: '取消',
      inputPlaceholder: '如：金额录入错误',
    })
    reason = res.value ?? ''
  } catch {
    return
  }
  try {
    await voucherApi.cancel(voucher.id, reason || undefined)
    ok('已作废')
    load()
  } catch {
    /* 错误已提示 */
  }
}

async function onEdit(voucher: any) {
  // 已审核凭证不能直接改（账簿可追溯性要求：改数必须先退出账簿）。
  // 这里不放开限制，只把关卡前移成一次确认，避免用户找不到修改入口以为系统坏了。
  if (voucher.status === 'approved') {
    if (!canUnapprove.value) {
      ElMessage.warning('已审核凭证需先反审核才能修改，当前账号没有反审核权限')
      return
    }
    try {
      await ElMessageBox.confirm(
        `「${voucher.word} 第 ${pad(voucher.voucherNo)} 号」已审核，已审核凭证不能直接改数。请先反审核（会退出账簿与报表），改完再重新审核。`,
        '修改已审核凭证',
        { type: 'warning', confirmButtonText: '反审核并修改', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
    try {
      await voucherApi.unapprove(voucher.id)
      ElMessage.success('已反审核，修改完成后请重新审核')
    } catch {
      return
    }
  }
  router.push({ path: '/voucher/create', query: { id: voucher.id } })
}

/** 复制凭证：跳转到录入页并按复制数据预填（作为新凭证） */
function onCopy(voucher: any) {
  router.push({ path: '/voucher/create', query: { copyFrom: voucher.id } })
}

/** 只有「已审核、未被红冲、且不是红冲凭证本身」才可红冲 */
function canReverse(voucher: any): boolean {
  return (
    voucher.status === 'approved' &&
    !voucher.isReversal &&
    !voucher.reversedById
  )
}

async function onReverse(voucher: any) {
  let reason = ''
  let reversalDate = ''
  try {
    const res = await ElMessageBox.prompt(
      `将按「${voucher.word}-${pad(voucher.voucherNo)}」生成一张借贷方向相反的已审核红冲凭证。请填写冲销原因（必填）：`,
      '红字冲销',
      {
        confirmButtonText: '确认红冲',
        cancelButtonText: '取消',
        inputPlaceholder: '如：金额录入错误',
        inputValidator: (v: string) => (v && v.trim() ? true : '请填写冲销原因'),
      },
    )
    reason = res.value ?? ''
  } catch {
    return
  }
  try {
    await voucherApi.reverse(voucher.id, { reason, reversalDate: reversalDate || undefined })
    ElMessage.success('红字冲销成功')
    load()
  } catch {
    /* 错误已提示 */
  }
}

async function onRemove(voucher: any) {
  if (!(await confirmDelete(`「${voucher.word} 第 ${pad(voucher.voucherNo)} 号」凭证`))) return
  try {
    await voucherApi.remove(voucher.id)
    ok('删除成功')
    load()
  } catch {
    /* 错误已提示 */
  }
}

// ============ 原始票据预览（票据自动生成的凭证才有 sourceReceipt） ============
const receiptVisible = ref(false)
const receiptUrl = ref('')
const receiptName = ref('')
const receiptIsPdf = ref(false)

async function openReceiptPreview(voucher: any) {
  const receipt = voucher.sourceReceipt
  if (!receipt) return
  try {
    const res = await service.get(receiptApi.fileUrl(receipt.id), { responseType: 'blob' })
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    receiptIsPdf.value = blob.type === 'application/pdf' || /\.pdf$/i.test(receipt.fileName ?? '')
    receiptUrl.value = URL.createObjectURL(blob)
    receiptName.value = receipt.fileName
    receiptVisible.value = true
  } catch {
    ElMessage.error('无法加载原始票据文件')
  }
}

/** 关闭预览时释放 blob URL */
function onReceiptClosed() {
  if (receiptUrl.value) {
    URL.revokeObjectURL(receiptUrl.value)
    receiptUrl.value = ''
  }
}

// ============ 辅助核算档案抽屉：往来单位 / 项目（含关联合同）/ 员工 ============
/** 收付款单类型（与现金银行插件保持一致） */
const AUX_BIZ_TYPES: Record<string, string> = {
  receipt: '收款单',
  payment: '付款单',
  transfer: '转账单',
  expense: '费用报销',
  income: '营业收入',
}
const AUX_BIZ_TAG: Record<string, string> = {
  receipt: 'success',
  payment: 'warning',
  transfer: 'primary',
  expense: 'danger',
  income: 'info',
}
const AUX_STATUS_TAG: Record<string, string> = {
  draft: 'info',
  approved: 'success',
  paid: 'success',
  repaid: 'success',
  rejected: 'danger',
  cancelled: 'danger',
}
const AUX_LOAN_STATUS: Record<string, string> = {
  draft: '草稿',
  approved: '已放款',
  repaid: '已还清',
  rejected: '已驳回',
}
const AUX_CLAIM_STATUS: Record<string, string> = {
  draft: '草稿',
  approved: '已审核',
  paid: '已付款',
  rejected: '已驳回',
}
const AUX_PAYROLL_STATUS: Record<string, string> = {
  draft: '草稿',
  approved: '已计提',
  paid: '已发放',
}

const emptyAuxHistory = () => ({
  totals: { debit: 0, credit: 0, net: 0 },
  vouchers: [] as any[],
  cashFlows: [] as any[],
  loans: [] as any[],
  claims: [] as any[],
  payrolls: [] as any[],
})

const auxDrawer = reactive({
  visible: false,
  kind: '' as 'partner' | 'project' | 'employee' | '',
  id: '',
  name: '',
  loading: false,
  data: null as any,
  /** 项目详情解析出的客户往来单位名 */
  partnerName: '',
  /** 关联合同（contracts 插件） */
  contracts: [] as any[],
  contractsState: 'hidden' as 'hidden' | 'loading' | 'ok' | 'denied',
  /** 历史单据：凭证 / 收付款单 / 借款 / 报销 / 工资 */
  history: emptyAuxHistory() as ReturnType<typeof emptyAuxHistory>,
  historyState: 'hidden' as 'hidden' | 'loading' | 'ok' | 'denied',
})

const periodLabel = (p?: number) => (p ? `${Math.floor(p / 100)}年${p % 100}月` : '-')

/**
 * 抽屉内各列表的本地分页状态。
 *
 * 历史单据是一次性聚合返回的（单档案量级有限），所以在内存里切片，
 * 不额外打接口；每页 10 条，切到别的档案时统一回到第 1 页。
 */
const AUX_PAGE_SIZES = [10, 20, 50]
const auxPager = reactive({
  contracts: { page: 1, pageSize: 10 },
  cashFlows: { page: 1, pageSize: 10 },
  loans: { page: 1, pageSize: 10 },
  claims: { page: 1, pageSize: 10 },
  payrolls: { page: 1, pageSize: 10 },
  vouchers: { page: 1, pageSize: 10 },
})
type AuxPagerKey = keyof typeof auxPager

/** 按当前分页状态切出当前页数据（模板里直接调用） */
function auxPage<T>(list: T[] | undefined, key: AuxPagerKey): T[] {
  const { page, pageSize } = auxPager[key]
  const rows = list ?? []
  const start = (page - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

/** 切换档案 / 重新加载时回到第 1 页，避免停在越界页码上看空白表 */
function resetAuxPager(): void {
  for (const pager of Object.values(auxPager)) pager.page = 1
}

/** 收付款单小计：收款 / 付款分别累计笔数与金额 */
const auxFlowTotals = computed(() => {
  const t = { receipt: 0, payment: 0, receiptCount: 0, paymentCount: 0 }
  for (const f of auxDrawer.history.cashFlows) {
    const amount = Number(f.amount) || 0
    if (f.bizType === 'receipt' || f.bizType === 'income') {
      t.receipt += amount
      t.receiptCount += 1
    } else if (f.bizType === 'payment' || f.bizType === 'expense') {
      t.payment += amount
      t.paymentCount += 1
    }
  }
  return t
})

const auxLoanTotals = computed(() => {
  let amount = 0
  let outstanding = 0
  for (const l of auxDrawer.history.loans) {
    amount += Number(l.amount) || 0
    outstanding += Number(l.outstanding) || 0
  }
  return { amount, outstanding }
})

const auxClaimTotal = computed(() =>
  auxDrawer.history.claims.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0),
)

const auxTitle = computed(() => {
  const label =
    ({ partner: '往来单位档案', project: '项目档案', employee: '员工档案' } as Record<string, string>)[auxDrawer.kind] ??
    '辅助核算'
  return `${label}${auxDrawer.name ? ` · ${auxDrawer.name}` : ''}`
})

const partnerTypeLabel = (t?: string) =>
  (({ customer: '客户', supplier: '供应商', both: '客户兼供应商' }) as Record<string, string>)[t ?? ''] ?? t ?? '-'

/** 合同插件是否可用（installed + enabled），只检测一次 */
const contractsPluginOk = ref<boolean | null>(null)
async function ensureContractsPlugin(): Promise<boolean> {
  if (contractsPluginOk.value !== null) return contractsPluginOk.value
  try {
    const installed = await pluginApi.installed()
    const c = (installed ?? []).find((p: any) => p.manifest?.id === 'contracts')
    contractsPluginOk.value = Boolean(c && c.enabled !== false && !(c as any).missingDependencies?.length)
  } catch {
    contractsPluginOk.value = false
  }
  return contractsPluginOk.value
}

async function openAux(kind: 'partner' | 'project' | 'employee', id: string, name?: string) {
  if (!id) return
  resetAuxPager()
  Object.assign(auxDrawer, {
    visible: true,
    kind,
    id,
    name: name ?? '',
    loading: true,
    data: null,
    partnerName: '',
    contracts: [],
    contractsState: 'hidden',
    history: emptyAuxHistory(),
    historyState: 'hidden',
  })
  // 档案信息与历史单据互不阻塞：档案先到先看，历史单据并行加载
  const historyTask = loadAuxHistory(kind, id)
  try {
    if (kind === 'partner') {
      auxDrawer.data = await partnerApi.detail(id)
    } else if (kind === 'employee') {
      auxDrawer.data = await employeeApi.detail(id)
    } else if (kind === 'project') {
      auxDrawer.data = await projectApi.detail(id)
      // 项目客户 → 顺手解析往来单位名，可继续点进去
      if (auxDrawer.data?.partnerId) {
        partnerApi
          .detail(auxDrawer.data.partnerId)
          .then((p: any) => (auxDrawer.partnerName = p?.name ?? ''))
          .catch(() => {})
      }
      // 关联合同（需安装 contracts 插件且有权限；否则降级为提示）
      const pluginOk = await ensureContractsPlugin()
      const permOk = userStore.hasPermission('contracts') || userStore.hasRole('admin')
      if (pluginOk && permOk) {
        auxDrawer.contractsState = 'loading'
        try {
          const res: any = await get('/contracts', { projectId: id, page: 1, pageSize: 50 })
          auxDrawer.contracts = res?.list ?? res?.items ?? []
          auxDrawer.contractsState = 'ok'
        } catch {
          auxDrawer.contractsState = 'denied'
        }
      } else if (pluginOk) {
        auxDrawer.contractsState = 'denied'
      }
    }
  } catch {
    auxDrawer.data = null
    ElMessage.error('档案加载失败')
  } finally {
    auxDrawer.loading = false
  }
  await historyTask
}

/**
 * 历史单据：这个单位 / 这个人 / 这个项目名下发生过的凭证、收付款单、
 * 借款、报销、工资。内核一次聚合返回；失败只降级提示，不影响档案展示。
 */
async function loadAuxHistory(kind: 'partner' | 'project' | 'employee', id: string) {
  auxDrawer.historyState = 'loading'
  try {
    const res: any = await voucherApi.auxHistory(kind, id)
    auxDrawer.history = { ...emptyAuxHistory(), ...(res ?? {}) }
    auxDrawer.historyState = 'ok'
  } catch {
    auxDrawer.history = emptyAuxHistory()
    auxDrawer.historyState = 'denied'
  }
}

// ---- 关联合同原件预览（加密落盘 → 解密流式输出 → blob 内嵌查看） ----
const contractPreview = reactive({
  visible: false,
  loading: false,
  url: '',
  title: '',
  isPdf: false,
})

async function onAuxContractPreview(row: any) {
  if (!row?.hasFile) return
  contractPreview.title = `${row.code} ${row.name}${row.fileName ? ` — ${row.fileName}` : ''}`
  contractPreview.visible = true
  contractPreview.loading = true
  try {
    const res = await service.get(`/contracts/${row.id}/download`, { responseType: 'blob' })
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    const isPdf = blob.type === 'application/pdf' || /\.pdf$/i.test(row.fileName ?? '')
    const isImage = blob.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(row.fileName ?? '')
    if (!isPdf && !isImage) {
      contractPreview.visible = false
      await downloadFile(`/contracts/${row.id}/download`, undefined, row.fileName || `${row.code}.pdf`)
      ElMessage.info('该格式暂不支持在线预览，已为您下载原件')
      return
    }
    contractPreview.isPdf = isPdf
    contractPreview.url = URL.createObjectURL(blob)
  } catch {
    contractPreview.visible = false
    ElMessage.error('合同原件加载失败')
  } finally {
    contractPreview.loading = false
  }
}

function onContractPreviewClosed() {
  if (contractPreview.url) {
    URL.revokeObjectURL(contractPreview.url)
    contractPreview.url = ''
  }
}

function onExport() {
  const rows: any[] = []
  for (const v of list.value as any[]) {
    for (const e of v.entries ?? []) {
      // 辅助核算拼成一行文本：往来单位/部门/项目/员工，便于导出后按人核对
      const aux = [e.partnerName, e.departmentName, e.projectName, e.employeeName]
        .filter(Boolean)
        .join('/')
      rows.push({
        date: v.voucherDate,
        word: v.word,
        no: pad(v.voucherNo),
        summary: e.summary,
        account: `${e.accountCode} ${e.accountName}`,
        aux,
        debit: e.debit,
        credit: e.credit,
      })
    }
  }
  exportExcel({
    filename: `凭证列表_${period.value}.xlsx`,
    sheetName: '凭证',
    title: `凭证列表（${period.value}）`,
    columns: [
      { title: '日期', prop: 'date', width: 12 },
      { title: '凭证字', prop: 'word', width: 8 },
      { title: '凭证号', prop: 'no', width: 10 },
      { title: '摘要', prop: 'summary', width: 26 },
      { title: '会计科目', prop: 'account', width: 26 },
      { title: '辅助核算', prop: 'aux', width: 20 },
      { title: '借方金额', prop: 'debit', width: 15, amount: true },
      { title: '贷方金额', prop: 'credit', width: 15, amount: true },
    ],
    rows,
  })
  ElMessage.success('导出成功')
}

onMounted(load)
</script>

<style scoped lang="scss">
.voucher-card {
  border: 1px solid var(--app-border);
  border-radius: 6px;
  margin-bottom: 12px;
  overflow: hidden;
  background: #fff;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: #f8fafc;
    border-bottom: 1px solid var(--app-border);
  }

  &__no {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }

  &__word {
    font-weight: 600;
  }

  &__no-text {
    color: #111827;
    font-weight: 600;
  }

  &__date {
    color: var(--app-text-secondary);
  }

  &__table {
    :deep(.el-table__cell) {
      padding: 5px 0;
    }
  }

  &__foot {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 6px 12px;
    border-top: 1px solid var(--app-border);
    font-size: 12px;
    color: var(--app-text-secondary);
  }

  &__remark {
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__receipt {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;

    .link {
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--el-color-primary);
      cursor: pointer;
    }
  }

  &__totals {
    margin-left: auto;
    display: flex;
    gap: 16px;
  }
}

.aux-tag {
  margin-right: 4px;

  &--link {
    cursor: pointer;
    &:hover {
      opacity: 0.8;
    }
  }
}

// 辅助核算档案抽屉
.aux-drawer__body {
  min-height: 200px;
}
// 抽屉内分页条贴紧所属表格（全局 .page-pagination 默认 12px 间距）
.page-pagination.aux-pager {
  margin-top: 6px;
}
.aux-drawer__section-title {
  margin: 16px 0 8px;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.aux-drawer__section-sub {
  font-size: 12px;
  font-weight: 400;
  color: var(--app-text-secondary);
}
.aux-drawer__loading {
  height: 120px;
}
.aux-drawer__hint {
  margin-top: 12px;
  font-size: 12px;
  color: var(--app-text-secondary);
}
.aux-drawer__muted {
  color: var(--app-text-secondary);
  font-size: 12px;
}

// 历史业务汇总条
.aux-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  padding: 8px 12px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: #f8fafc;
  font-size: 12px;
  color: var(--app-text-secondary);

  &__item {
    b {
      color: #111827;
      font-size: 13px;
      margin: 0 2px;
    }

    em {
      font-style: normal;
      color: var(--app-text-secondary);

      // 模板里 </b> 与 <em> 之间的换行会被 Vue 压缩，靠 CSS 补分隔，避免「14,137.604 笔」黏连
      &::before {
        content: '·';
        margin: 0 6px 0 4px;
      }
    }
  }
}

// 展开后的凭证分录
.aux-reversal-tag {
  margin-left: 4px;
}
.aux-voucher-entries {
  padding: 2px 16px 6px 48px;
  background: #fafafa;

  &__line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 200px 190px;
    gap: 10px;
    align-items: baseline;
    padding: 3px 0;
    font-size: 12px;
    border-bottom: 1px dashed #eef0f3;

    &:last-child {
      border-bottom: none;
    }
  }

  &__summary {
    color: #374151;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__account {
    color: var(--app-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__amount {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    font-variant-numeric: tabular-nums;
    color: #1f2937;

    em {
      font-style: normal;
    }
  }
}
.aux-contract-preview__body {
  min-height: 200px;
}
</style>