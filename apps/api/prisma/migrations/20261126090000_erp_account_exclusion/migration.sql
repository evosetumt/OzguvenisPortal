BEGIN TRY

BEGIN TRAN;

-- CreateTable: Cari Hesaplar listesinde kullanıcıya özel "hariç tut" kayıtları
CREATE TABLE [dbo].[ErpAccountExclusion] (
    [userId] INT NOT NULL,
    [customerCode] NVARCHAR(35) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpAccountExclusion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpAccountExclusion_pkey] PRIMARY KEY CLUSTERED ([userId],[customerCode])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
