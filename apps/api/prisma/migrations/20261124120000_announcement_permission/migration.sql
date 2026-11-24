BEGIN TRY

BEGIN TRAN;

-- Duyuru yayınlama izni: mevcut kurulumlarda seed yeniden çalışmadığı için izin burada oluşturulur
-- ve Admin ile Yönetici rollerine verilir (seed.ts ile aynı). Diğer roller Ayarlar → Roller'den yetkilendirilir.
IF NOT EXISTS (SELECT 1 FROM [dbo].[Permission] WHERE [code] = N'announcement.manage')
    INSERT INTO [dbo].[Permission] ([code], [label]) VALUES (N'announcement.manage', N'Duyuru yayınla');

INSERT INTO [dbo].[RolePermission] ([roleId], [permissionId], [scope])
SELECT r.[id], p.[id], N'all'
FROM [dbo].[Role] r CROSS JOIN [dbo].[Permission] p
WHERE p.[code] = N'announcement.manage'
  AND r.[name] IN (N'Admin', N'Yönetici')
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
