BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[MessageRevision] (
    [id] INT NOT NULL IDENTITY(1,1),
    [messageId] INT NOT NULL,
    [body] NVARCHAR(max) NOT NULL,
    [editedById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MessageRevision_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [MessageRevision_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[MeetingNote] (
    [id] INT NOT NULL IDENTITY(1,1),
    [meetingId] INT NOT NULL,
    [userId] INT NOT NULL,
    [body] NVARCHAR(max) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MeetingNote_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [MeetingNote_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [MeetingNote_meetingId_userId_key] UNIQUE NONCLUSTERED ([meetingId],[userId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MessageRevision_messageId_idx] ON [dbo].[MessageRevision]([messageId]);

-- AddForeignKey
ALTER TABLE [dbo].[MessageRevision] ADD CONSTRAINT [MessageRevision_messageId_fkey] FOREIGN KEY ([messageId]) REFERENCES [dbo].[Message]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[MessageRevision] ADD CONSTRAINT [MessageRevision_editedById_fkey] FOREIGN KEY ([editedById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MeetingNote] ADD CONSTRAINT [MeetingNote_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [dbo].[Meeting]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[MeetingNote] ADD CONSTRAINT [MeetingNote_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
