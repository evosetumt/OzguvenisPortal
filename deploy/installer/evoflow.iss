; EvoFlow kurulum programı (Inno Setup 6). Doğrudan derlemeyin; build-installer.ps1 paket klasörünü hazırlayıp çağırır:
;   ISCC /DAppVersion=1.0.0 /DStageDir=...\out\stage /DOutDir=...\out evoflow.iss
;
; Sessiz kurulum (otomasyon): EvoFlow-Setup.exe /VERYSILENT /SUPPRESSMSGBOXES /PARAMS="C:\yol\params.json"
;   params.json alanları için bkz. scripts\kur-sonrasi.ps1 başlığı. Güncellemede /PARAMS gerekmez.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef StageDir
  #define StageDir "out\stage"
#endif
#ifndef OutDir
  #define OutDir "out"
#endif

[Setup]
AppId={{6E1B7C52-3F7A-4C1E-9B6D-EF0A51A7E2C4}
AppName=EvoFlow Özgüveniş
AppVersion={#AppVersion}
AppVerName=EvoFlow Özgüveniş {#AppVersion}
AppPublisher=Evoset
AppPublisherURL=https://www.evoset.com.tr
AppSupportURL=https://www.evoset.com.tr
DefaultDirName={autopf}\EvoFlow
DefaultGroupName=EvoFlow Özgüveniş
DisableProgramGroupPage=yes
OutputDir={#OutDir}
OutputBaseFilename=EvoFlow-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
MinVersion=10.0
WizardStyle=modern
UninstallDisplayName=EvoFlow Özgüveniş
UninstallDisplayIcon={app}\runtime\node.exe
; Güncellemede klasör değiştirilemez (servis ve yapılandırma bu klasöre bağlıdır).
DisableDirPage=auto
CloseApplications=no
SetupLogging=yes

[Languages]
Name: "tr"; MessagesFile: "compiler:Languages\Turkish.isl"

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\EvoFlow portalını aç"; Filename: "{code:GetPublicUrl}"
Name: "{group}\EvoFlow durumu"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\durum.ps1"""
Name: "{group}\EvoFlow yapılandırma klasörü"; Filename: "{commonappdata}\EvoFlow\config"
Name: "{group}\EvoFlow günlükleri"; Filename: "{commonappdata}\EvoFlow\logs"
Name: "{group}\Kurulum ve bakım rehberi"; Filename: "{app}\OKUBENI.md"

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\kaldir-oncesi.ps1"" -AppDir ""{app}"""; Flags: runhidden waituntilterminated; RunOnceId: "EvoFlowRemoveServices"

[Code]
var
  ModePage: TInputOptionWizardPage;
  DbPage: TInputQueryWizardPage;
  AdminPage: TInputQueryWizardPage;
  ImportPage: TInputDirWizardPage;
  PublishPage: TInputQueryWizardPage;
  IsUpgrade: Boolean;

function ConfigFile(): String;
begin
  Result := ExpandConstant('{commonappdata}\EvoFlow\config\evoflow.env');
end;

function GetPublicUrl(Param: String): String;
begin
  Result := 'https://evoflow.ozguvenis.com.tr';
  if Assigned(PublishPage) and (Trim(PublishPage.Values[0]) <> '') then Result := Trim(PublishPage.Values[0]);
end;

function ParamsArg(): String;
begin
  Result := ExpandConstant('{param:PARAMS|}');
end;

procedure InitializeWizard();
begin
  IsUpgrade := FileExists(ConfigFile());

  ModePage := CreateInputOptionPage(wpSelectDir, 'Kurulum türü',
    'Veritabanı ve yapılandırma nereden gelsin?',
    'Bu bilgisayarda daha önce eski yöntemle (proje klasöründen) çalışan bir portal varsa "Eski kurulumdan aktar" seçin: ' +
    'veritabanı bağlantısı, ayarlar ve yüklenen dosyalar taşınır, eski başlangıç görevi kaldırılır.', True, False);
  ModePage.Add('Yeni kurulum (boş veritabanı, ilk yönetici hesabı oluşturulur)');
  ModePage.Add('Eski kurulumdan aktar (apps\api klasöründeki .env ve uploads)');
  ModePage.SelectedValueIndex := 0;

  DbPage := CreateInputQueryPage(ModePage.ID, 'Veritabanı', 'SQL Server bağlantısı',
    'Veritabanı yoksa SQL Server''da önceden oluşturun; kullanıcı bu veritabanında tablo oluşturabilmeli (db_owner).');
  DbPage.Add('Sunucu (ör. localhost:1433 veya SUNUCU\ÖRNEK):', False);
  DbPage.Add('Veritabanı adı:', False);
  DbPage.Add('Kullanıcı (SQL kimlik doğrulaması):', False);
  DbPage.Add('Parola:', True);
  DbPage.Values[0] := 'localhost:1433';
  DbPage.Values[1] := 'EvoFlow';

  AdminPage := CreateInputQueryPage(DbPage.ID, 'Yönetici hesabı', 'Portalın ilk yönetici hesabı',
    'Bu hesapla giriş yapıp diğer kullanıcıları oluşturacaksınız. Parola en az 8 karakter olmalı.');
  AdminPage.Add('E-posta:', False);
  AdminPage.Add('Parola:', True);
  AdminPage.Add('Parola (tekrar):', True);

  ImportPage := CreateInputDirPage(ModePage.ID, 'Eski kurulumdan aktar', 'Eski portalın apps\api klasörü',
    '.env dosyasının bulunduğu klasörü seçin (ör. ...\Ozguvenis\apps\api).', False, '');
  ImportPage.Add('');

  PublishPage := CreateInputQueryPage(AdminPage.ID, 'Yayın', 'İnternet adresi ve Cloudflare Tunnel',
    'Portal yalnız bu bilgisayarda (127.0.0.1) dinler; dışarıya Cloudflare Tunnel açar. Tünel token''ı yoksa boş bırakın, ' +
    'sonra Başlat menüsündeki rehberdeki tunnel.ps1 ile ekleyebilirsiniz.');
  PublishPage.Add('Yayın adresi:', False);
  PublishPage.Add('Cloudflare Tunnel token''ı (isteğe bağlı):', True);
  PublishPage.Values[0] := 'https://evoflow.ozguvenis.com.tr';
end;

function IsImport(): Boolean;
begin
  Result := ModePage.SelectedValueIndex = 1;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if IsUpgrade or (ParamsArg() <> '') then
    Result := (PageID = ModePage.ID) or (PageID = DbPage.ID) or (PageID = AdminPage.ID) or (PageID = ImportPage.ID) or (PageID = PublishPage.ID)
  else if (PageID = DbPage.ID) or (PageID = AdminPage.ID) then
    Result := IsImport()
  else if PageID = ImportPage.ID then
    Result := not IsImport();
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = DbPage.ID then begin
    if (Trim(DbPage.Values[0]) = '') or (Trim(DbPage.Values[1]) = '') or (Trim(DbPage.Values[2]) = '') or (DbPage.Values[3] = '') then begin
      MsgBox('Tüm veritabanı bilgilerini doldurun.', mbError, MB_OK); Result := False;
    end;
  end else if CurPageID = AdminPage.ID then begin
    if (Pos('@', AdminPage.Values[0]) < 2) then begin
      MsgBox('Geçerli bir e-posta adresi girin.', mbError, MB_OK); Result := False;
    end else if Length(AdminPage.Values[1]) < 8 then begin
      MsgBox('Parola en az 8 karakter olmalı.', mbError, MB_OK); Result := False;
    end else if AdminPage.Values[1] <> AdminPage.Values[2] then begin
      MsgBox('Parolalar eşleşmiyor.', mbError, MB_OK); Result := False;
    end;
  end else if CurPageID = ImportPage.ID then begin
    if not FileExists(AddBackslash(ImportPage.Values[0]) + '.env') then begin
      MsgBox('Seçilen klasörde .env dosyası yok. Eski portalın apps\api klasörünü seçin.', mbError, MB_OK); Result := False;
    end;
  end else if CurPageID = PublishPage.ID then begin
    if Pos('https://', Lowercase(Trim(PublishPage.Values[0]))) <> 1 then begin
      MsgBox('Yayın adresi https:// ile başlamalı.', mbError, MB_OK); Result := False;
    end;
  end;
end;

{ JSON metin değeri: ters bölü ve tırnak kaçırılır. }
function J(S: String): String;
begin
  StringChangeEx(S, '\', '\\', True);
  StringChangeEx(S, '"', '\"', True);
  Result := '"' + S + '"';
end;

function WriteParams(): String;
var
  Mode, Body: String;
begin
  Result := ParamsArg();
  if Result <> '' then exit;
  Result := ExpandConstant('{tmp}\evoflow-params.json');
  if IsUpgrade then Mode := 'upgrade' else if IsImport() then Mode := 'import' else Mode := 'new';
  Body := '{' +
    '"mode":' + J(Mode) + ',' +
    '"dbServer":' + J(Trim(DbPage.Values[0])) + ',' +
    '"dbName":' + J(Trim(DbPage.Values[1])) + ',' +
    '"dbUser":' + J(Trim(DbPage.Values[2])) + ',' +
    '"dbPassword":' + J(DbPage.Values[3]) + ',' +
    '"adminEmail":' + J(Trim(AdminPage.Values[0])) + ',' +
    '"adminPassword":' + J(AdminPage.Values[1]) + ',' +
    '"importDir":' + J(Trim(ImportPage.Values[0])) + ',' +
    '"publicUrl":' + J(Trim(PublishPage.Values[0])) + ',' +
    '"tunnelToken":' + J(Trim(PublishPage.Values[1])) +
    '}';
  // {tmp} kurulum bitince silinir; parolalar diske kalıcı yazılmaz.
  SaveStringToFile(Result, Body, False);
end;

{ Güncellemede dosyalar değiştirilmeden önce servisler durdurulur (açık node.exe/cloudflared.exe kilitli olur). }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
  Script: String;
begin
  Result := '';
  Script := ExpandConstant('{app}\scripts\durdur.ps1');
  if FileExists(Script) then
    Exec('powershell.exe', '-NoProfile -ExecutionPolicy Bypass -File "' + Script + '" -AppDir "' + ExpandConstant('{app}') + '"',
      '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
  Params: String;
begin
  if CurStep <> ssPostInstall then exit;
  Params := WriteParams();
  WizardForm.StatusLabel.Caption := 'Veritabanı güncelleniyor ve servis başlatılıyor...';
  if not Exec('powershell.exe',
      '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\scripts\kur-sonrasi.ps1') + '" -AppDir "' + ExpandConstant('{app}') + '" -ParamsFile "' + Params + '"',
      '', SW_HIDE, ewWaitUntilTerminated, Code) or (Code <> 0) then
    MsgBox('Kurulum tamamlanamadı (kod ' + IntToStr(Code) + ').' + #13#10 +
      'Ayrıntılar: ' + ExpandConstant('{commonappdata}\EvoFlow\logs\kurulum.log') + #13#10 +
      'Sorunu giderdikten sonra kurulumu yeniden çalıştırabilirsiniz.', mbCriticalError, MB_OK);
  if ParamsArg() = '' then DeleteFile(Params);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    MsgBox('EvoFlow kaldırıldı. Veritabanı ve ' + ExpandConstant('{commonappdata}\EvoFlow') +
      ' klasöründeki yapılandırma, yüklenen dosyalar ve günlükler korunmuştur.', mbInformation, MB_OK);
end;
