BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Department] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(120) NOT NULL,
    [parentId] INT,
    [managerId] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Department_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Department_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] INT NOT NULL IDENTITY(1,1),
    [email] NVARCHAR(190) NOT NULL,
    [phone] NVARCHAR(30),
    [fullName] NVARCHAR(150) NOT NULL,
    [avatarUrl] NVARCHAR(400),
    [passwordHash] NVARCHAR(120) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [User_status_df] DEFAULT 'active',
    [departmentId] INT,
    [lastLoginAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[Role] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(80) NOT NULL,
    [description] NVARCHAR(300),
    CONSTRAINT [Role_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Role_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[Permission] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(100) NOT NULL,
    [label] NVARCHAR(200),
    CONSTRAINT [Permission_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Permission_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[RolePermission] (
    [roleId] INT NOT NULL,
    [permissionId] INT NOT NULL,
    [scope] NVARCHAR(20) NOT NULL CONSTRAINT [RolePermission_scope_df] DEFAULT 'own',
    CONSTRAINT [RolePermission_pkey] PRIMARY KEY CLUSTERED ([roleId],[permissionId])
);

-- CreateTable
CREATE TABLE [dbo].[UserRole] (
    [userId] INT NOT NULL,
    [roleId] INT NOT NULL,
    CONSTRAINT [UserRole_pkey] PRIMARY KEY CLUSTERED ([userId],[roleId])
);

-- CreateTable
CREATE TABLE [dbo].[AuditLog] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT,
    [action] NVARCHAR(80) NOT NULL,
    [entity] NVARCHAR(80),
    [entityId] NVARCHAR(60),
    [diff] NVARCHAR(max),
    [ip] NVARCHAR(60),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuditLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AuditLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Setting] (
    [key] NVARCHAR(120) NOT NULL,
    [value] NVARCHAR(max) NOT NULL,
    CONSTRAINT [Setting_pkey] PRIMARY KEY CLUSTERED ([key])
);

-- CreateTable
CREATE TABLE [dbo].[Project] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(120) NOT NULL,
    [color] NVARCHAR(20) NOT NULL CONSTRAINT [Project_color_df] DEFAULT '#3b82f6',
    [ownerId] INT,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [Project_status_df] DEFAULT 'active',
    [pinned] BIT NOT NULL CONSTRAINT [Project_pinned_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Project_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [Project_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ProjectMember] (
    [projectId] INT NOT NULL,
    [userId] INT NOT NULL,
    CONSTRAINT [ProjectMember_pkey] PRIMARY KEY CLUSTERED ([projectId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[TaskStatus] (
    [id] INT NOT NULL IDENTITY(1,1),
    [projectId] INT,
    [name] NVARCHAR(60) NOT NULL,
    [sortOrder] INT NOT NULL CONSTRAINT [TaskStatus_sortOrder_df] DEFAULT 0,
    [isDone] BIT NOT NULL CONSTRAINT [TaskStatus_isDone_df] DEFAULT 0,
    CONSTRAINT [TaskStatus_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Task] (
    [id] INT NOT NULL IDENTITY(1,1),
    [projectId] INT,
    [statusId] INT NOT NULL,
    [title] NVARCHAR(250) NOT NULL,
    [description] NVARCHAR(max),
    [priority] NVARCHAR(20) NOT NULL CONSTRAINT [Task_priority_df] DEFAULT 'normal',
    [assigneeId] INT,
    [createdById] INT NOT NULL,
    [dueDate] DATETIME2,
    [sortOrder] INT NOT NULL CONSTRAINT [Task_sortOrder_df] DEFAULT 0,
    [taskType] NVARCHAR(20) NOT NULL CONSTRAINT [Task_taskType_df] DEFAULT 'general',
    [customerRef] NVARCHAR(60),
    [erpDocNo] NVARCHAR(60),
    [completedViaErp] BIT NOT NULL CONSTRAINT [Task_completedViaErp_df] DEFAULT 0,
    [completedAt] DATETIME2,
    [relatedType] NVARCHAR(40),
    [relatedId] NVARCHAR(60),
    [reminderSentAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Task_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [Task_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TaskSubtask] (
    [id] INT NOT NULL IDENTITY(1,1),
    [taskId] INT NOT NULL,
    [title] NVARCHAR(250) NOT NULL,
    [done] BIT NOT NULL CONSTRAINT [TaskSubtask_done_df] DEFAULT 0,
    [sortOrder] INT NOT NULL CONSTRAINT [TaskSubtask_sortOrder_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TaskSubtask_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [TaskSubtask_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TaskComment] (
    [id] INT NOT NULL IDENTITY(1,1),
    [taskId] INT NOT NULL,
    [userId] INT NOT NULL,
    [body] NVARCHAR(max) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TaskComment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [TaskComment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TaskWatcher] (
    [taskId] INT NOT NULL,
    [userId] INT NOT NULL,
    CONSTRAINT [TaskWatcher_pkey] PRIMARY KEY CLUSTERED ([taskId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[Notification] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [type] NVARCHAR(60) NOT NULL,
    [title] NVARCHAR(200) NOT NULL,
    [body] NVARCHAR(1000),
    [link] NVARCHAR(300),
    [readAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Notification_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Notification_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CalendarEvent] (
    [id] INT NOT NULL IDENTITY(1,1),
    [title] NVARCHAR(200) NOT NULL,
    [description] NVARCHAR(2000),
    [location] NVARCHAR(200),
    [startsAt] DATETIME2 NOT NULL,
    [endsAt] DATETIME2 NOT NULL,
    [allDay] BIT NOT NULL CONSTRAINT [CalendarEvent_allDay_df] DEFAULT 0,
    [visibility] NVARCHAR(20) NOT NULL CONSTRAINT [CalendarEvent_visibility_df] DEFAULT 'private',
    [sourceType] NVARCHAR(40),
    [sourceId] NVARCHAR(60),
    [ownerId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CalendarEvent_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [CalendarEvent_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CalendarEventAttendee] (
    [eventId] INT NOT NULL,
    [userId] INT NOT NULL,
    CONSTRAINT [CalendarEventAttendee_pkey] PRIMARY KEY CLUSTERED ([eventId],[userId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_entity_entityId_idx] ON [dbo].[AuditLog]([entity], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_createdAt_idx] ON [dbo].[AuditLog]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Task_statusId_sortOrder_idx] ON [dbo].[Task]([statusId], [sortOrder]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Task_assigneeId_idx] ON [dbo].[Task]([assigneeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Task_dueDate_idx] ON [dbo].[Task]([dueDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Notification_userId_readAt_idx] ON [dbo].[Notification]([userId], [readAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CalendarEvent_startsAt_idx] ON [dbo].[CalendarEvent]([startsAt]);

-- AddForeignKey
ALTER TABLE [dbo].[Department] ADD CONSTRAINT [Department_parentId_fkey] FOREIGN KEY ([parentId]) REFERENCES [dbo].[Department]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Department] ADD CONSTRAINT [Department_managerId_fkey] FOREIGN KEY ([managerId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_departmentId_fkey] FOREIGN KEY ([departmentId]) REFERENCES [dbo].[Department]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RolePermission] ADD CONSTRAINT [RolePermission_roleId_fkey] FOREIGN KEY ([roleId]) REFERENCES [dbo].[Role]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RolePermission] ADD CONSTRAINT [RolePermission_permissionId_fkey] FOREIGN KEY ([permissionId]) REFERENCES [dbo].[Permission]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[UserRole] ADD CONSTRAINT [UserRole_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[UserRole] ADD CONSTRAINT [UserRole_roleId_fkey] FOREIGN KEY ([roleId]) REFERENCES [dbo].[Role]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[AuditLog] ADD CONSTRAINT [AuditLog_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Project] ADD CONSTRAINT [Project_ownerId_fkey] FOREIGN KEY ([ownerId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProjectMember] ADD CONSTRAINT [ProjectMember_projectId_fkey] FOREIGN KEY ([projectId]) REFERENCES [dbo].[Project]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ProjectMember] ADD CONSTRAINT [ProjectMember_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TaskStatus] ADD CONSTRAINT [TaskStatus_projectId_fkey] FOREIGN KEY ([projectId]) REFERENCES [dbo].[Project]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Task] ADD CONSTRAINT [Task_projectId_fkey] FOREIGN KEY ([projectId]) REFERENCES [dbo].[Project]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Task] ADD CONSTRAINT [Task_statusId_fkey] FOREIGN KEY ([statusId]) REFERENCES [dbo].[TaskStatus]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Task] ADD CONSTRAINT [Task_assigneeId_fkey] FOREIGN KEY ([assigneeId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Task] ADD CONSTRAINT [Task_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TaskSubtask] ADD CONSTRAINT [TaskSubtask_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[Task]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TaskComment] ADD CONSTRAINT [TaskComment_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[Task]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TaskComment] ADD CONSTRAINT [TaskComment_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TaskWatcher] ADD CONSTRAINT [TaskWatcher_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[Task]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TaskWatcher] ADD CONSTRAINT [TaskWatcher_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Notification] ADD CONSTRAINT [Notification_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CalendarEvent] ADD CONSTRAINT [CalendarEvent_ownerId_fkey] FOREIGN KEY ([ownerId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CalendarEventAttendee] ADD CONSTRAINT [CalendarEventAttendee_eventId_fkey] FOREIGN KEY ([eventId]) REFERENCES [dbo].[CalendarEvent]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CalendarEventAttendee] ADD CONSTRAINT [CalendarEventAttendee_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
