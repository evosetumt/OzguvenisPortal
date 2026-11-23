BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[FeedPost] (
    [id] INT NOT NULL IDENTITY(1,1),
    [kind] NVARCHAR(30) NOT NULL CONSTRAINT [FeedPost_kind_df] DEFAULT 'post',
    [authorId] INT,
    [body] NVARCHAR(4000) NOT NULL,
    [customerCode] NVARCHAR(35),
    [customerName] NVARCHAR(200),
    [relatedType] NVARCHAR(30),
    [relatedId] NVARCHAR(60),
    [relatedLabel] NVARCHAR(200),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FeedPost_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [FeedPost_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[FeedAudience] (
    [postId] INT NOT NULL,
    [userId] INT NOT NULL,
    CONSTRAINT [FeedAudience_pkey] PRIMARY KEY CLUSTERED ([postId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[FeedLike] (
    [postId] INT NOT NULL,
    [userId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FeedLike_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [FeedLike_pkey] PRIMARY KEY CLUSTERED ([postId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[FeedComment] (
    [id] INT NOT NULL IDENTITY(1,1),
    [postId] INT NOT NULL,
    [userId] INT NOT NULL,
    [body] NVARCHAR(2000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FeedComment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [deletedAt] DATETIME2,
    CONSTRAINT [FeedComment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FeedPost_createdAt_idx] ON [dbo].[FeedPost]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FeedPost_customerCode_idx] ON [dbo].[FeedPost]([customerCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FeedPost_relatedType_relatedId_idx] ON [dbo].[FeedPost]([relatedType], [relatedId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FeedAudience_userId_idx] ON [dbo].[FeedAudience]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FeedComment_postId_idx] ON [dbo].[FeedComment]([postId]);

-- AddForeignKey
ALTER TABLE [dbo].[FeedPost] ADD CONSTRAINT [FeedPost_authorId_fkey] FOREIGN KEY ([authorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FeedAudience] ADD CONSTRAINT [FeedAudience_postId_fkey] FOREIGN KEY ([postId]) REFERENCES [dbo].[FeedPost]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[FeedAudience] ADD CONSTRAINT [FeedAudience_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FeedLike] ADD CONSTRAINT [FeedLike_postId_fkey] FOREIGN KEY ([postId]) REFERENCES [dbo].[FeedPost]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[FeedLike] ADD CONSTRAINT [FeedLike_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FeedComment] ADD CONSTRAINT [FeedComment_postId_fkey] FOREIGN KEY ([postId]) REFERENCES [dbo].[FeedPost]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[FeedComment] ADD CONSTRAINT [FeedComment_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Haber akışı izni: mevcut kurulumlarda roller seed ile güncellenmediği için burada verilir.
-- Admin ve Yönetici herkesin akışını görür (all); diğer roller yalnız kendi akışını (own).
IF NOT EXISTS (SELECT 1 FROM [dbo].[Permission] WHERE [code] = N'feed.read')
    INSERT INTO [dbo].[Permission] ([code], [label]) VALUES (N'feed.read', N'Haber akışını görüntüle');

INSERT INTO [dbo].[RolePermission] ([roleId], [permissionId], [scope])
SELECT r.[id], p.[id], CASE WHEN r.[name] IN (N'Admin', N'Yönetici') THEN N'all' ELSE N'own' END
FROM [dbo].[Role] r CROSS JOIN [dbo].[Permission] p
WHERE p.[code] = N'feed.read'
  AND NOT EXISTS (SELECT 1 FROM [dbo].[RolePermission] rp WHERE rp.[roleId] = r.[id] AND rp.[permissionId] = p.[id]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
