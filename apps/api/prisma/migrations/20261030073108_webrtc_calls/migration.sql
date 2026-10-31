BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Message] ADD [callId] INT;

-- CreateTable
CREATE TABLE [dbo].[Call] (
    [id] INT NOT NULL IDENTITY(1,1),
    [kind] NVARCHAR(10) NOT NULL,
    [status] NVARCHAR(12) NOT NULL CONSTRAINT [Call_status_df] DEFAULT 'ringing',
    [conversationId] INT,
    [meetingId] INT,
    [startedById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Call_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [answeredAt] DATETIME2,
    [endedAt] DATETIME2,
    CONSTRAINT [Call_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CallParticipant] (
    [callId] INT NOT NULL,
    [userId] INT NOT NULL,
    [state] NVARCHAR(10) NOT NULL CONSTRAINT [CallParticipant_state_df] DEFAULT 'ringing',
    [joinedAt] DATETIME2,
    [leftAt] DATETIME2,
    CONSTRAINT [CallParticipant_pkey] PRIMARY KEY CLUSTERED ([callId],[userId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Call_conversationId_status_idx] ON [dbo].[Call]([conversationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Call_meetingId_status_idx] ON [dbo].[Call]([meetingId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CallParticipant_userId_state_idx] ON [dbo].[CallParticipant]([userId], [state]);

-- AddForeignKey
ALTER TABLE [dbo].[Message] ADD CONSTRAINT [Message_callId_fkey] FOREIGN KEY ([callId]) REFERENCES [dbo].[Call]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Call] ADD CONSTRAINT [Call_conversationId_fkey] FOREIGN KEY ([conversationId]) REFERENCES [dbo].[Conversation]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Call] ADD CONSTRAINT [Call_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [dbo].[Meeting]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Call] ADD CONSTRAINT [Call_startedById_fkey] FOREIGN KEY ([startedById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CallParticipant] ADD CONSTRAINT [CallParticipant_callId_fkey] FOREIGN KEY ([callId]) REFERENCES [dbo].[Call]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CallParticipant] ADD CONSTRAINT [CallParticipant_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
