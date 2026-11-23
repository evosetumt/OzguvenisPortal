BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[User] ADD [lastSeenAt] DATETIME2;

-- CreateTable
CREATE TABLE [dbo].[TaskAttachment] (
    [taskId] INT NOT NULL,
    [attachmentId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TaskAttachment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [TaskAttachment_pkey] PRIMARY KEY CLUSTERED ([taskId],[attachmentId])
);

-- CreateTable
CREATE TABLE [dbo].[CalendarEventAttachment] (
    [eventId] INT NOT NULL,
    [attachmentId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CalendarEventAttachment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CalendarEventAttachment_pkey] PRIMARY KEY CLUSTERED ([eventId],[attachmentId])
);

-- CreateTable
CREATE TABLE [dbo].[FeedPostAttachment] (
    [postId] INT NOT NULL,
    [attachmentId] INT NOT NULL,
    [sortOrder] INT NOT NULL CONSTRAINT [FeedPostAttachment_sortOrder_df] DEFAULT 0,
    CONSTRAINT [FeedPostAttachment_pkey] PRIMARY KEY CLUSTERED ([postId],[attachmentId])
);

-- CreateTable
CREATE TABLE [dbo].[Announcement] (
    [id] INT NOT NULL IDENTITY(1,1),
    [title] NVARCHAR(200) NOT NULL,
    [body] NVARCHAR(2000),
    [important] BIT NOT NULL CONSTRAINT [Announcement_important_df] DEFAULT 0,
    [allDepartments] BIT NOT NULL CONSTRAINT [Announcement_allDepartments_df] DEFAULT 0,
    [startsAt] DATETIME2 NOT NULL CONSTRAINT [Announcement_startsAt_df] DEFAULT CURRENT_TIMESTAMP,
    [endsAt] DATETIME2,
    [authorId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Announcement_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [Announcement_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AnnouncementDepartment] (
    [announcementId] INT NOT NULL,
    [departmentId] INT NOT NULL,
    CONSTRAINT [AnnouncementDepartment_pkey] PRIMARY KEY CLUSTERED ([announcementId],[departmentId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TaskAttachment_attachmentId_idx] ON [dbo].[TaskAttachment]([attachmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CalendarEventAttachment_attachmentId_idx] ON [dbo].[CalendarEventAttachment]([attachmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FeedPostAttachment_attachmentId_idx] ON [dbo].[FeedPostAttachment]([attachmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Announcement_startsAt_idx] ON [dbo].[Announcement]([startsAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AnnouncementDepartment_departmentId_idx] ON [dbo].[AnnouncementDepartment]([departmentId]);

-- AddForeignKey
ALTER TABLE [dbo].[TaskAttachment] ADD CONSTRAINT [TaskAttachment_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[Task]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TaskAttachment] ADD CONSTRAINT [TaskAttachment_attachmentId_fkey] FOREIGN KEY ([attachmentId]) REFERENCES [dbo].[Attachment]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CalendarEventAttachment] ADD CONSTRAINT [CalendarEventAttachment_eventId_fkey] FOREIGN KEY ([eventId]) REFERENCES [dbo].[CalendarEvent]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CalendarEventAttachment] ADD CONSTRAINT [CalendarEventAttachment_attachmentId_fkey] FOREIGN KEY ([attachmentId]) REFERENCES [dbo].[Attachment]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FeedPostAttachment] ADD CONSTRAINT [FeedPostAttachment_postId_fkey] FOREIGN KEY ([postId]) REFERENCES [dbo].[FeedPost]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[FeedPostAttachment] ADD CONSTRAINT [FeedPostAttachment_attachmentId_fkey] FOREIGN KEY ([attachmentId]) REFERENCES [dbo].[Attachment]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Announcement] ADD CONSTRAINT [Announcement_authorId_fkey] FOREIGN KEY ([authorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AnnouncementDepartment] ADD CONSTRAINT [AnnouncementDepartment_announcementId_fkey] FOREIGN KEY ([announcementId]) REFERENCES [dbo].[Announcement]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[AnnouncementDepartment] ADD CONSTRAINT [AnnouncementDepartment_departmentId_fkey] FOREIGN KEY ([departmentId]) REFERENCES [dbo].[Department]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
