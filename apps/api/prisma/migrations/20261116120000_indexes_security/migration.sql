BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[User] ADD [tokenVersion] INT NOT NULL CONSTRAINT [User_tokenVersion_df] DEFAULT 0;

-- CreateIndex
CREATE NONCLUSTERED INDEX [ConversationMember_userId_idx] ON [dbo].[ConversationMember]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpAccountTx_dueDate_idx] ON [dbo].[ErpAccountTx]([dueDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpOrder_repCode_date_idx] ON [dbo].[ErpOrder]([repCode], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpOrder_kind_status_idx] ON [dbo].[ErpOrder]([kind], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpOrder_dueDate_idx] ON [dbo].[ErpOrder]([dueDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpQuote_repCode_date_idx] ON [dbo].[ErpQuote]([repCode], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpShipment_repCode_date_idx] ON [dbo].[ErpShipment]([repCode], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ExpenseReceipt_attachmentId_idx] ON [dbo].[ExpenseReceipt]([attachmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Message_attachmentId_idx] ON [dbo].[Message]([attachmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Message_senderId_idx] ON [dbo].[Message]([senderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Message_callId_idx] ON [dbo].[Message]([callId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Notification_userId_createdAt_idx] ON [dbo].[Notification]([userId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Payment_previousId_idx] ON [dbo].[Payment]([previousId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProcessTask_instanceId_status_idx] ON [dbo].[ProcessTask]([instanceId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProcessTask_candidateDeptId_status_idx] ON [dbo].[ProcessTask]([candidateDeptId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Task_createdById_idx] ON [dbo].[Task]([createdById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Task_projectId_idx] ON [dbo].[Task]([projectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Task_relatedType_relatedId_idx] ON [dbo].[Task]([relatedType], [relatedId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Task_taskType_customerRef_idx] ON [dbo].[Task]([taskType], [customerRef]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TaskComment_taskId_idx] ON [dbo].[TaskComment]([taskId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TaskSubtask_taskId_idx] ON [dbo].[TaskSubtask]([taskId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TaskWatcher_userId_idx] ON [dbo].[TaskWatcher]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TrackedItemAttachment_attachmentId_idx] ON [dbo].[TrackedItemAttachment]([attachmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VehicleService_vehicleId_date_idx] ON [dbo].[VehicleService]([vehicleId], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VehicleService_nextDueDate_idx] ON [dbo].[VehicleService]([nextDueDate]);

-- Filtrelenmiş benzersiz indexler (Prisma şemasında ifade edilemez; NULL değerler çakışmasın diye WHERE ile).
-- Mevcut veride yinelenen kayıt varsa index atlanır (migration düşmez); kod tarafı yine yinelemeyi yakalar.
IF NOT EXISTS (SELECT [directKey] FROM [dbo].[Conversation] WHERE [directKey] IS NOT NULL GROUP BY [directKey] HAVING COUNT(*) > 1)
    EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [Conversation_directKey_unique] ON [dbo].[Conversation]([directKey]) WHERE [directKey] IS NOT NULL');

IF NOT EXISTS (SELECT [previousId] FROM [dbo].[Payment] WHERE [previousId] IS NOT NULL GROUP BY [previousId] HAVING COUNT(*) > 1)
    EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [Payment_previousId_unique] ON [dbo].[Payment]([previousId]) WHERE [previousId] IS NOT NULL');

-- Döviz masrafında TL karşılığını kullanıcı girer: otomatik onay eşiği yalnız TL masraflara uygulanır,
-- dövizli masraf her zaman yönetici onayına gider. Yönetici koşulu değiştirdiyse eski metin bulunmaz, dokunulmaz.
UPDATE [dbo].[ProcessDefinition]
SET [bpmnXml] = REPLACE([bpmnXml], N'${amountTry &lt;= settings.expense.autoApproveLimit}', N'${currency == ''TRY'' &amp;&amp; amountTry &lt;= settings.expense.autoApproveLimit}')
WHERE [key] = N'expense_approval';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

