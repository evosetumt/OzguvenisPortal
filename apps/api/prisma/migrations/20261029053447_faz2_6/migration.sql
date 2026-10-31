BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[User] ADD [erpRepCode] NVARCHAR(20);

-- CreateTable
CREATE TABLE [dbo].[NotificationRule] (
    [id] INT NOT NULL IDENTITY(1,1),
    [eventCode] NVARCHAR(60) NOT NULL,
    [label] NVARCHAR(150) NOT NULL,
    [channels] NVARCHAR(100) NOT NULL CONSTRAINT [NotificationRule_channels_df] DEFAULT 'inapp',
    [isActive] BIT NOT NULL CONSTRAINT [NotificationRule_isActive_df] DEFAULT 1,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [NotificationRule_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [NotificationRule_eventCode_key] UNIQUE NONCLUSTERED ([eventCode])
);

-- CreateTable
CREATE TABLE [dbo].[NotificationDelivery] (
    [id] INT NOT NULL IDENTITY(1,1),
    [notificationId] INT,
    [userId] INT NOT NULL,
    [channel] NVARCHAR(20) NOT NULL,
    [status] NVARCHAR(20) NOT NULL,
    [error] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [NotificationDelivery_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [NotificationDelivery_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[DeviceToken] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [platform] NVARCHAR(20) NOT NULL,
    [token] NVARCHAR(max) NOT NULL,
    [tokenHash] NVARCHAR(64) NOT NULL,
    [lastSeenAt] DATETIME2 NOT NULL CONSTRAINT [DeviceToken_lastSeenAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DeviceToken_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [DeviceToken_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [DeviceToken_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateTable
CREATE TABLE [dbo].[UserNotificationPref] (
    [userId] INT NOT NULL,
    [eventCode] NVARCHAR(60) NOT NULL,
    [channels] NVARCHAR(100) NOT NULL,
    CONSTRAINT [UserNotificationPref_pkey] PRIMARY KEY CLUSTERED ([userId],[eventCode])
);

-- CreateTable
CREATE TABLE [dbo].[Attachment] (
    [id] INT NOT NULL IDENTITY(1,1),
    [storageKey] NVARCHAR(200) NOT NULL,
    [fileName] NVARCHAR(255) NOT NULL,
    [mime] NVARCHAR(120) NOT NULL,
    [size] INT NOT NULL,
    [uploadedById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Attachment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Attachment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Attachment_storageKey_key] UNIQUE NONCLUSTERED ([storageKey])
);

-- CreateTable
CREATE TABLE [dbo].[ErpCustomer] (
    [code] NVARCHAR(35) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [type] NVARCHAR(5),
    [taxOffice] NVARCHAR(100),
    [taxNo] NVARCHAR(30),
    [phone] NVARCHAR(40),
    [email] NVARCHAR(150),
    [city] NVARCHAR(60),
    [address] NVARCHAR(400),
    [repCode] NVARCHAR(20),
    [debit] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpCustomer_debit_df] DEFAULT 0,
    [credit] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpCustomer_credit_df] DEFAULT 0,
    [balance] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpCustomer_balance_df] DEFAULT 0,
    [erpUpdatedAt] DATETIME2,
    [syncedAt] DATETIME2 NOT NULL CONSTRAINT [ErpCustomer_syncedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpCustomer_pkey] PRIMARY KEY CLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[ErpAccountTx] (
    [id] INT NOT NULL,
    [customerCode] NVARCHAR(35) NOT NULL,
    [date] DATETIME2 NOT NULL,
    [dueDate] DATETIME2,
    [docNo] NVARCHAR(30),
    [description] NVARCHAR(200),
    [txType] NVARCHAR(5),
    [debit] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpAccountTx_debit_df] DEFAULT 0,
    [credit] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpAccountTx_credit_df] DEFAULT 0,
    [repCode] NVARCHAR(20),
    [syncedAt] DATETIME2 NOT NULL CONSTRAINT [ErpAccountTx_syncedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpAccountTx_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpOrder] (
    [id] INT NOT NULL IDENTITY(1,1),
    [kind] NVARCHAR(10) NOT NULL,
    [docNo] NVARCHAR(30) NOT NULL,
    [customerCode] NVARCHAR(35) NOT NULL,
    [date] DATETIME2 NOT NULL,
    [dueDate] DATETIME2,
    [description] NVARCHAR(200),
    [gross] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpOrder_gross_df] DEFAULT 0,
    [vat] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpOrder_vat_df] DEFAULT 0,
    [total] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpOrder_total_df] DEFAULT 0,
    [currency] NVARCHAR(10) NOT NULL CONSTRAINT [ErpOrder_currency_df] DEFAULT 'TRY',
    [repCode] NVARCHAR(20),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [ErpOrder_status_df] DEFAULT 'open',
    [totalQty] DECIMAL(18,3) NOT NULL CONSTRAINT [ErpOrder_totalQty_df] DEFAULT 0,
    [shippedQty] DECIMAL(18,3) NOT NULL CONSTRAINT [ErpOrder_shippedQty_df] DEFAULT 0,
    [erpCreatedAt] DATETIME2,
    [erpUpdatedAt] DATETIME2,
    [syncedAt] DATETIME2 NOT NULL CONSTRAINT [ErpOrder_syncedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpOrder_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpOrder_kind_docNo_key] UNIQUE NONCLUSTERED ([kind],[docNo])
);

-- CreateTable
CREATE TABLE [dbo].[ErpOrderItem] (
    [id] INT NOT NULL IDENTITY(1,1),
    [orderId] INT NOT NULL,
    [lineNo] INT NOT NULL,
    [stockCode] NVARCHAR(40) NOT NULL,
    [stockName] NVARCHAR(200),
    [qty] DECIMAL(18,3) NOT NULL,
    [shippedQty] DECIMAL(18,3) NOT NULL CONSTRAINT [ErpOrderItem_shippedQty_df] DEFAULT 0,
    [unit] NVARCHAR(20),
    [unitPrice] DECIMAL(18,4) NOT NULL,
    [vatRate] DECIMAL(6,2) NOT NULL CONSTRAINT [ErpOrderItem_vatRate_df] DEFAULT 0,
    CONSTRAINT [ErpOrderItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpQuote] (
    [id] INT NOT NULL IDENTITY(1,1),
    [docNo] NVARCHAR(30) NOT NULL,
    [customerCode] NVARCHAR(35) NOT NULL,
    [date] DATETIME2 NOT NULL,
    [validUntil] DATETIME2,
    [description] NVARCHAR(200),
    [gross] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpQuote_gross_df] DEFAULT 0,
    [vat] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpQuote_vat_df] DEFAULT 0,
    [total] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpQuote_total_df] DEFAULT 0,
    [currency] NVARCHAR(10) NOT NULL CONSTRAINT [ErpQuote_currency_df] DEFAULT 'TRY',
    [repCode] NVARCHAR(20),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [ErpQuote_status_df] DEFAULT 'open',
    [erpCreatedAt] DATETIME2,
    [erpUpdatedAt] DATETIME2,
    [syncedAt] DATETIME2 NOT NULL CONSTRAINT [ErpQuote_syncedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpQuote_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpQuote_docNo_key] UNIQUE NONCLUSTERED ([docNo])
);

-- CreateTable
CREATE TABLE [dbo].[ErpQuoteItem] (
    [id] INT NOT NULL IDENTITY(1,1),
    [quoteId] INT NOT NULL,
    [lineNo] INT NOT NULL,
    [stockCode] NVARCHAR(40) NOT NULL,
    [stockName] NVARCHAR(200),
    [qty] DECIMAL(18,3) NOT NULL,
    [unit] NVARCHAR(20),
    [unitPrice] DECIMAL(18,4) NOT NULL,
    [vatRate] DECIMAL(6,2) NOT NULL CONSTRAINT [ErpQuoteItem_vatRate_df] DEFAULT 0,
    CONSTRAINT [ErpQuoteItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpShipment] (
    [id] INT NOT NULL IDENTITY(1,1),
    [docType] NVARCHAR(10) NOT NULL,
    [docNo] NVARCHAR(30) NOT NULL,
    [customerCode] NVARCHAR(35) NOT NULL,
    [date] DATETIME2 NOT NULL,
    [orderNos] NVARCHAR(500),
    [total] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpShipment_total_df] DEFAULT 0,
    [repCode] NVARCHAR(20),
    [erpCreatedAt] DATETIME2,
    [syncedAt] DATETIME2 NOT NULL CONSTRAINT [ErpShipment_syncedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpShipment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpShipment_docType_docNo_key] UNIQUE NONCLUSTERED ([docType],[docNo])
);

-- CreateTable
CREATE TABLE [dbo].[ErpSyncRun] (
    [id] INT NOT NULL IDENTITY(1,1),
    [entity] NVARCHAR(40) NOT NULL,
    [trigger] NVARCHAR(20) NOT NULL CONSTRAINT [ErpSyncRun_trigger_df] DEFAULT 'schedule',
    [startedAt] DATETIME2 NOT NULL CONSTRAINT [ErpSyncRun_startedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [finishedAt] DATETIME2,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [ErpSyncRun_status_df] DEFAULT 'running',
    [rows] INT NOT NULL CONSTRAINT [ErpSyncRun_rows_df] DEFAULT 0,
    [error] NVARCHAR(2000),
    CONSTRAINT [ErpSyncRun_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ErpSyncState] (
    [entity] NVARCHAR(40) NOT NULL,
    [cursor] NVARCHAR(60),
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ErpSyncState_pkey] PRIMARY KEY CLUSTERED ([entity])
);

-- CreateTable
CREATE TABLE [dbo].[ExpenseCategory] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(80) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [ExpenseCategory_isActive_df] DEFAULT 1,
    [sortOrder] INT NOT NULL CONSTRAINT [ExpenseCategory_sortOrder_df] DEFAULT 0,
    CONSTRAINT [ExpenseCategory_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ExpenseCategory_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[Expense] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [categoryId] INT NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [currency] NVARCHAR(10) NOT NULL CONSTRAINT [Expense_currency_df] DEFAULT 'TRY',
    [amountTry] DECIMAL(18,2) NOT NULL,
    [expenseDate] DATETIME2 NOT NULL,
    [description] NVARCHAR(500) NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [Expense_status_df] DEFAULT 'draft',
    [processInstanceId] INT,
    [submittedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Expense_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [Expense_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ExpenseReceipt] (
    [expenseId] INT NOT NULL,
    [attachmentId] INT NOT NULL,
    CONSTRAINT [ExpenseReceipt_pkey] PRIMARY KEY CLUSTERED ([expenseId],[attachmentId])
);

-- CreateTable
CREATE TABLE [dbo].[ExpenseApproval] (
    [id] INT NOT NULL IDENTITY(1,1),
    [expenseId] INT NOT NULL,
    [step] NVARCHAR(20) NOT NULL,
    [approverId] INT,
    [decision] NVARCHAR(20) NOT NULL,
    [comment] NVARCHAR(1000),
    [at] DATETIME2 NOT NULL CONSTRAINT [ExpenseApproval_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ExpenseApproval_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ProcessDefinition] (
    [id] INT NOT NULL IDENTITY(1,1),
    [key] NVARCHAR(80) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [version] INT NOT NULL CONSTRAINT [ProcessDefinition_version_df] DEFAULT 1,
    [bpmnXml] NVARCHAR(max) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [ProcessDefinition_status_df] DEFAULT 'draft',
    [createdById] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProcessDefinition_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ProcessDefinition_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ProcessDefinition_key_version_key] UNIQUE NONCLUSTERED ([key],[version])
);

-- CreateTable
CREATE TABLE [dbo].[ProcessInstance] (
    [id] INT NOT NULL IDENTITY(1,1),
    [definitionId] INT NOT NULL,
    [businessKey] NVARCHAR(80),
    [entityType] NVARCHAR(40),
    [entityId] NVARCHAR(60),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [ProcessInstance_status_df] DEFAULT 'running',
    [startedById] INT,
    [startedAt] DATETIME2 NOT NULL CONSTRAINT [ProcessInstance_startedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [endedAt] DATETIME2,
    [variables] NVARCHAR(max) NOT NULL CONSTRAINT [ProcessInstance_variables_df] DEFAULT '{}',
    [error] NVARCHAR(2000),
    CONSTRAINT [ProcessInstance_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ProcessTask] (
    [id] INT NOT NULL IDENTITY(1,1),
    [instanceId] INT NOT NULL,
    [elementId] NVARCHAR(100) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [assigneeId] INT,
    [candidateRole] NVARCHAR(80),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [ProcessTask_status_df] DEFAULT 'open',
    [dueAt] DATETIME2,
    [reminderSentAt] DATETIME2,
    [completedById] INT,
    [completedAt] DATETIME2,
    [formData] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProcessTask_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ProcessTask_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ProcessEvent] (
    [id] INT NOT NULL IDENTITY(1,1),
    [instanceId] INT NOT NULL,
    [elementId] NVARCHAR(100),
    [type] NVARCHAR(40) NOT NULL,
    [at] DATETIME2 NOT NULL CONSTRAINT [ProcessEvent_at_df] DEFAULT CURRENT_TIMESTAMP,
    [payload] NVARCHAR(max),
    CONSTRAINT [ProcessEvent_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Vehicle] (
    [id] INT NOT NULL IDENTITY(1,1),
    [plate] NVARCHAR(20) NOT NULL,
    [brandModel] NVARCHAR(120),
    [year] INT,
    [assignedUserId] INT,
    [km] INT,
    [notes] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Vehicle_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [Vehicle_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Vehicle_plate_key] UNIQUE NONCLUSTERED ([plate])
);

-- CreateTable
CREATE TABLE [dbo].[VehicleService] (
    [id] INT NOT NULL IDENTITY(1,1),
    [vehicleId] INT NOT NULL,
    [type] NVARCHAR(60) NOT NULL,
    [date] DATETIME2 NOT NULL,
    [km] INT,
    [cost] DECIMAL(18,2),
    [nextDueDate] DATETIME2,
    [nextDueKm] INT,
    [notes] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [VehicleService_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [VehicleService_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TrackedItem] (
    [id] INT NOT NULL IDENTITY(1,1),
    [category] NVARCHAR(30) NOT NULL,
    [title] NVARCHAR(200) NOT NULL,
    [counterparty] NVARCHAR(200),
    [vehicleId] INT,
    [startDate] DATETIME2,
    [endDate] DATETIME2 NOT NULL,
    [amount] DECIMAL(18,2),
    [currency] NVARCHAR(10) NOT NULL CONSTRAINT [TrackedItem_currency_df] DEFAULT 'TRY',
    [renewalPeriod] NVARCHAR(20),
    [ownerId] INT NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [TrackedItem_status_df] DEFAULT 'active',
    [reminderDays] NVARCHAR(60) NOT NULL CONSTRAINT [TrackedItem_reminderDays_df] DEFAULT '60,30,7,1',
    [notifyUserIds] NVARCHAR(200),
    [notes] NVARCHAR(2000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TrackedItem_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [TrackedItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TrackedItemReminder] (
    [id] INT NOT NULL IDENTITY(1,1),
    [trackedItemId] INT NOT NULL,
    [daysBefore] INT NOT NULL,
    [forEndDate] DATETIME2 NOT NULL,
    [sentAt] DATETIME2 NOT NULL CONSTRAINT [TrackedItemReminder_sentAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [TrackedItemReminder_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TrackedItemReminder_trackedItemId_daysBefore_forEndDate_key] UNIQUE NONCLUSTERED ([trackedItemId],[daysBefore],[forEndDate])
);

-- CreateTable
CREATE TABLE [dbo].[TrackedItemAttachment] (
    [trackedItemId] INT NOT NULL,
    [attachmentId] INT NOT NULL,
    CONSTRAINT [TrackedItemAttachment_pkey] PRIMARY KEY CLUSTERED ([trackedItemId],[attachmentId])
);

-- CreateTable
CREATE TABLE [dbo].[WhatsappContact] (
    [id] INT NOT NULL IDENTITY(1,1),
    [phone] NVARCHAR(20) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [customerCode] NVARCHAR(35),
    [userId] INT,
    [optInAt] DATETIME2,
    [optOutAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WhatsappContact_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [WhatsappContact_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [WhatsappContact_phone_key] UNIQUE NONCLUSTERED ([phone])
);

-- CreateTable
CREATE TABLE [dbo].[WhatsappMessage] (
    [id] INT NOT NULL IDENTITY(1,1),
    [direction] NVARCHAR(5) NOT NULL,
    [contactId] INT NOT NULL,
    [templateName] NVARCHAR(120),
    [body] NVARCHAR(max),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [WhatsappMessage_status_df] DEFAULT 'queued',
    [providerMsgId] NVARCHAR(120),
    [error] NVARCHAR(1000),
    [createdById] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WhatsappMessage_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [WhatsappMessage_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Conversation] (
    [id] INT NOT NULL IDENTITY(1,1),
    [type] NVARCHAR(10) NOT NULL,
    [title] NVARCHAR(150),
    [directKey] NVARCHAR(40),
    [createdById] INT NOT NULL,
    [lastMessageAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Conversation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Conversation_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ConversationMember] (
    [conversationId] INT NOT NULL,
    [userId] INT NOT NULL,
    [lastReadMessageId] INT,
    [joinedAt] DATETIME2 NOT NULL CONSTRAINT [ConversationMember_joinedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ConversationMember_pkey] PRIMARY KEY CLUSTERED ([conversationId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[Message] (
    [id] INT NOT NULL IDENTITY(1,1),
    [conversationId] INT NOT NULL,
    [senderId] INT NOT NULL,
    [body] NVARCHAR(max) NOT NULL,
    [attachmentId] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Message_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [editedAt] DATETIME2,
    [deletedAt] DATETIME2,
    CONSTRAINT [Message_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Meeting] (
    [id] INT NOT NULL IDENTITY(1,1),
    [title] NVARCHAR(200) NOT NULL,
    [roomName] NVARCHAR(80) NOT NULL,
    [startsAt] DATETIME2 NOT NULL,
    [endsAt] DATETIME2 NOT NULL,
    [organizerId] INT NOT NULL,
    [calendarEventId] INT,
    [conversationId] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Meeting_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [deletedAt] DATETIME2,
    CONSTRAINT [Meeting_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Meeting_roomName_key] UNIQUE NONCLUSTERED ([roomName])
);

-- CreateTable
CREATE TABLE [dbo].[MeetingParticipant] (
    [meetingId] INT NOT NULL,
    [userId] INT NOT NULL,
    CONSTRAINT [MeetingParticipant_pkey] PRIMARY KEY CLUSTERED ([meetingId],[userId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [NotificationDelivery_createdAt_idx] ON [dbo].[NotificationDelivery]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpCustomer_name_idx] ON [dbo].[ErpCustomer]([name]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpCustomer_repCode_idx] ON [dbo].[ErpCustomer]([repCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpAccountTx_customerCode_date_idx] ON [dbo].[ErpAccountTx]([customerCode], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpOrder_customerCode_idx] ON [dbo].[ErpOrder]([customerCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpOrder_date_idx] ON [dbo].[ErpOrder]([date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpQuote_customerCode_idx] ON [dbo].[ErpQuote]([customerCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpQuote_date_idx] ON [dbo].[ErpQuote]([date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpShipment_customerCode_idx] ON [dbo].[ErpShipment]([customerCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpShipment_date_idx] ON [dbo].[ErpShipment]([date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpSyncRun_startedAt_idx] ON [dbo].[ErpSyncRun]([startedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Expense_userId_status_idx] ON [dbo].[Expense]([userId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Expense_status_idx] ON [dbo].[Expense]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ExpenseApproval_expenseId_idx] ON [dbo].[ExpenseApproval]([expenseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProcessInstance_entityType_entityId_idx] ON [dbo].[ProcessInstance]([entityType], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProcessInstance_status_idx] ON [dbo].[ProcessInstance]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProcessTask_status_assigneeId_idx] ON [dbo].[ProcessTask]([status], [assigneeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProcessTask_status_candidateRole_idx] ON [dbo].[ProcessTask]([status], [candidateRole]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProcessEvent_instanceId_at_idx] ON [dbo].[ProcessEvent]([instanceId], [at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TrackedItem_endDate_idx] ON [dbo].[TrackedItem]([endDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WhatsappMessage_providerMsgId_idx] ON [dbo].[WhatsappMessage]([providerMsgId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WhatsappMessage_contactId_createdAt_idx] ON [dbo].[WhatsappMessage]([contactId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Conversation_directKey_idx] ON [dbo].[Conversation]([directKey]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Message_conversationId_id_idx] ON [dbo].[Message]([conversationId], [id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Meeting_startsAt_idx] ON [dbo].[Meeting]([startsAt]);

-- AddForeignKey
ALTER TABLE [dbo].[DeviceToken] ADD CONSTRAINT [DeviceToken_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[UserNotificationPref] ADD CONSTRAINT [UserNotificationPref_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Attachment] ADD CONSTRAINT [Attachment_uploadedById_fkey] FOREIGN KEY ([uploadedById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ErpOrderItem] ADD CONSTRAINT [ErpOrderItem_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[ErpOrder]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ErpQuoteItem] ADD CONSTRAINT [ErpQuoteItem_quoteId_fkey] FOREIGN KEY ([quoteId]) REFERENCES [dbo].[ErpQuote]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Expense] ADD CONSTRAINT [Expense_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Expense] ADD CONSTRAINT [Expense_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[ExpenseCategory]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ExpenseReceipt] ADD CONSTRAINT [ExpenseReceipt_expenseId_fkey] FOREIGN KEY ([expenseId]) REFERENCES [dbo].[Expense]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ExpenseReceipt] ADD CONSTRAINT [ExpenseReceipt_attachmentId_fkey] FOREIGN KEY ([attachmentId]) REFERENCES [dbo].[Attachment]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ExpenseApproval] ADD CONSTRAINT [ExpenseApproval_expenseId_fkey] FOREIGN KEY ([expenseId]) REFERENCES [dbo].[Expense]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ExpenseApproval] ADD CONSTRAINT [ExpenseApproval_approverId_fkey] FOREIGN KEY ([approverId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProcessDefinition] ADD CONSTRAINT [ProcessDefinition_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProcessInstance] ADD CONSTRAINT [ProcessInstance_definitionId_fkey] FOREIGN KEY ([definitionId]) REFERENCES [dbo].[ProcessDefinition]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProcessInstance] ADD CONSTRAINT [ProcessInstance_startedById_fkey] FOREIGN KEY ([startedById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProcessTask] ADD CONSTRAINT [ProcessTask_instanceId_fkey] FOREIGN KEY ([instanceId]) REFERENCES [dbo].[ProcessInstance]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ProcessTask] ADD CONSTRAINT [ProcessTask_assigneeId_fkey] FOREIGN KEY ([assigneeId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProcessTask] ADD CONSTRAINT [ProcessTask_completedById_fkey] FOREIGN KEY ([completedById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProcessEvent] ADD CONSTRAINT [ProcessEvent_instanceId_fkey] FOREIGN KEY ([instanceId]) REFERENCES [dbo].[ProcessInstance]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Vehicle] ADD CONSTRAINT [Vehicle_assignedUserId_fkey] FOREIGN KEY ([assignedUserId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[VehicleService] ADD CONSTRAINT [VehicleService_vehicleId_fkey] FOREIGN KEY ([vehicleId]) REFERENCES [dbo].[Vehicle]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TrackedItem] ADD CONSTRAINT [TrackedItem_vehicleId_fkey] FOREIGN KEY ([vehicleId]) REFERENCES [dbo].[Vehicle]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TrackedItem] ADD CONSTRAINT [TrackedItem_ownerId_fkey] FOREIGN KEY ([ownerId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TrackedItemReminder] ADD CONSTRAINT [TrackedItemReminder_trackedItemId_fkey] FOREIGN KEY ([trackedItemId]) REFERENCES [dbo].[TrackedItem]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TrackedItemAttachment] ADD CONSTRAINT [TrackedItemAttachment_trackedItemId_fkey] FOREIGN KEY ([trackedItemId]) REFERENCES [dbo].[TrackedItem]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TrackedItemAttachment] ADD CONSTRAINT [TrackedItemAttachment_attachmentId_fkey] FOREIGN KEY ([attachmentId]) REFERENCES [dbo].[Attachment]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WhatsappContact] ADD CONSTRAINT [WhatsappContact_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WhatsappMessage] ADD CONSTRAINT [WhatsappMessage_contactId_fkey] FOREIGN KEY ([contactId]) REFERENCES [dbo].[WhatsappContact]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[WhatsappMessage] ADD CONSTRAINT [WhatsappMessage_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Conversation] ADD CONSTRAINT [Conversation_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ConversationMember] ADD CONSTRAINT [ConversationMember_conversationId_fkey] FOREIGN KEY ([conversationId]) REFERENCES [dbo].[Conversation]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ConversationMember] ADD CONSTRAINT [ConversationMember_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Message] ADD CONSTRAINT [Message_conversationId_fkey] FOREIGN KEY ([conversationId]) REFERENCES [dbo].[Conversation]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Message] ADD CONSTRAINT [Message_senderId_fkey] FOREIGN KEY ([senderId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Message] ADD CONSTRAINT [Message_attachmentId_fkey] FOREIGN KEY ([attachmentId]) REFERENCES [dbo].[Attachment]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Meeting] ADD CONSTRAINT [Meeting_organizerId_fkey] FOREIGN KEY ([organizerId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Meeting] ADD CONSTRAINT [Meeting_conversationId_fkey] FOREIGN KEY ([conversationId]) REFERENCES [dbo].[Conversation]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MeetingParticipant] ADD CONSTRAINT [MeetingParticipant_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [dbo].[Meeting]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[MeetingParticipant] ADD CONSTRAINT [MeetingParticipant_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
