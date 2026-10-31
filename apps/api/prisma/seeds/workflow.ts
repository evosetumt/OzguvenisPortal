import type { PrismaClient } from '@prisma/client';
import { EXPENSE_APPROVAL_XML } from '../../src/workflow/default-processes';

const CATEGORIES = ['Yakıt', 'Yemek', 'Konaklama', 'Ulaşım', 'Kırtasiye', 'Temsil-Ağırlama', 'Diğer'];

/** Masraf kategorileri, onay hatırlatma süresi ve varsayılan masraf onay süreci (sürüm 1, etkin). */
export async function seedWorkflow(prisma: PrismaClient) {
  for (const [i, name] of CATEGORIES.entries()) {
    await prisma.expenseCategory.upsert({ where: { name }, update: {}, create: { name, sortOrder: i } });
  }
  const settings: [string, string][] = [
    ['workflow.approvalReminderHours', '48'],
    ['ai.expenseCategorySuggest', 'false'], // dış servise veri gider; yönetici açmadıkça kapalı
  ];
  for (const [key, value] of settings) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  if (!(await prisma.processDefinition.findFirst({ where: { key: 'expense_approval' } }))) {
    await prisma.processDefinition.create({
      data: { key: 'expense_approval', name: 'Masraf onayı', version: 1, status: 'active', bpmnXml: EXPENSE_APPROVAL_XML },
    });
  }
}
