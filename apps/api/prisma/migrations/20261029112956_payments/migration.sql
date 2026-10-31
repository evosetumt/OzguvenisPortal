BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Payment] (
    [id] INT NOT NULL IDENTITY(1,1),
    [type] NVARCHAR(20) NOT NULL,
    [title] NVARCHAR(200) NOT NULL,
    [counterparty] NVARCHAR(200),
    [docNo] NVARCHAR(60),
    [amount] DECIMAL(18,2) NOT NULL,
    [currency] NVARCHAR(10) NOT NULL CONSTRAINT [Payment_currency_df] DEFAULT 'TRY',
    [dueDate] DATETIME2 NOT NULL,
    [departmentId] INT NOT NULL,
    [leadDays] INT,
    [recurrence] NVARCHAR(20) NOT NULL CONSTRAINT [Payment_recurrence_df] DEFAULT 'none',
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [Payment_status_df] DEFAULT 'planned',
    [taskId] INT,
    [assigneeId] INT,
    [taskOpenedAt] DATETIME2,
    [paidAt] DATETIME2,
    [paidById] INT,
    [previousId] INT,
    [notes] NVARCHAR(2000),
    [createdById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Payment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [Payment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Payment_status_dueDate_idx] ON [dbo].[Payment]([status], [dueDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Payment_departmentId_idx] ON [dbo].[Payment]([departmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Payment_taskId_idx] ON [dbo].[Payment]([taskId]);

-- AddForeignKey
ALTER TABLE [dbo].[Payment] ADD CONSTRAINT [Payment_departmentId_fkey] FOREIGN KEY ([departmentId]) REFERENCES [dbo].[Department]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Payment] ADD CONSTRAINT [Payment_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[Task]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Payment] ADD CONSTRAINT [Payment_assigneeId_fkey] FOREIGN KEY ([assigneeId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Payment] ADD CONSTRAINT [Payment_paidById_fkey] FOREIGN KEY ([paidById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Payment] ADD CONSTRAINT [Payment_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
