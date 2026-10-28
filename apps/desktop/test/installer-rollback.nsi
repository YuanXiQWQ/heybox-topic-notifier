; @file 在独立目录和独立 HKCU 键中执行实际 NSIS 回滚函数，不安装或启动真实应用。
Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "Heybox installer rollback integration test"
OutFile "${TEST_ROOT}\installer-rollback-test.exe"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "${DESKTOP_ROOT}\node_modules\app-builder-lib\templates\nsis\include\UAC.nsh"
!include "${DESKTOP_ROOT}\node_modules\app-builder-lib\templates\nsis\include\StdUtils.nsh"
!addplugindir /x86-unicode "${PLUGIN_ROOT}"
!define APP_ID "heybox-installer-test"
!define APP_EXECUTABLE_FILENAME "application.bin"
!define INSTALL_REGISTRY_KEY "Software\HeyboxInstallerTest\${TEST_ID}\install"
!define UNINSTALL_REGISTRY_KEY "Software\HeyboxInstallerTest\${TEST_ID}\uninstall"
!define VERSION "2.0.0"
!define isUpdated '1 == 1'
LangString decompressionFailed 1033 "Integration fixture setup failed"
LangString AppRestoreComplete 1033 "Previous installation restored"
LangString AppRestoreIncomplete 1033 "Recovery incomplete; keep the backup"
Var installMode

; /**
;  * 将实际恢复阶段写入隔离测试目录。
;  * @param {string} STAGE 阶段名称。
;  */
!macro AppInstallLog STAGE
  Push $0
  FileOpen $0 "${TEST_ROOT}\events.log" a
  FileSeek $0 0 END
  FileWrite $0 "${STAGE}$\r$\n"
  FileClose $0
  Pop $0
!macroend
!include /CHARSET=UTF8 "${DESKTOP_ROOT}\installer-rollback.nsh"
!insertmacro AppRollbackFunctions

Section
  SetShellVarContext current
  StrCpy $installMode CurrentUser
  StrCpy $INSTDIR "${TEST_ROOT}\application"
  CreateDirectory "$INSTDIR\resources"
  FileOpen $0 "$INSTDIR\application.bin" w
  FileWrite $0 "original executable fixture"
  FileClose $0
  FileOpen $0 "$INSTDIR\resources\runtime.bin" w
  FileWrite $0 "original runtime fixture"
  FileClose $0
  WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" DisplayVersion "1.0.0"
  WriteRegDWORD SHCTX "${UNINSTALL_REGISTRY_KEY}" EstimatedSize 42
  Call AppPrepareRollback
  StrCmp $AppRollbackActive "1" 0 failed
  StrCmp $AppBackupCount "2" 0 failed
  WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" DisplayVersion "2.0.0"

  !if "${TEST_CASE}" == "corrupt-backup"
    FileOpen $0 "$AppBackup\files\application.bin" w
    FileWrite $0 "damaged backup"
    FileClose $0
    Call AppRollback
    StrCmp $AppTreeOk "0" 0 failed
    FileOpen $0 "$INSTDIR\application.bin" r
    FileRead $0 $1
    FileClose $0
    StrCmp $1 "original executable fixture" 0 failed
  !else
    !if "${TEST_CASE}" == "locked-target"
      System::Call 'kernel32::CreateFileW(w "$INSTDIR\application.bin", i 0x80000000, i 0, p 0, i 3, i 0, p 0) p.r5'
      IntCmp $5 -1 failed
      Call AppRollback
      StrCpy $4 $AppTreeOk
      System::Call 'kernel32::CloseHandle(p r5)'
      StrCmp $4 "0" 0 failed
      StrCpy $AppRollbackActive "1"
    !endif
    !if "${TEST_CASE}" == "interrupted-restore"
      SetOutPath $TEMP
      Rename "$INSTDIR" "$AppBackup\failed"
      WriteINIStr "$AppBackup\state.ini" transaction phase "restoring"
      CreateDirectory "$INSTDIR"
    !else
      Delete "$INSTDIR\application.bin"
      FileOpen $0 "$INSTDIR\resources\runtime.bin" w
      FileWrite $0 "incomplete update"
      FileClose $0
      FileOpen $0 "$INSTDIR\extra.bin" w
      FileWrite $0 "new version only"
      FileClose $0
    !endif
    Call AppRollback
    StrCmp $AppTreeOk "1" 0 failed
    StrCmp $AppTreeCount "2" 0 failed
    IfFileExists "$INSTDIR\extra.bin" failed
    ReadRegStr $0 SHCTX "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
    StrCmp $0 "1.0.0" 0 failed
    ReadRegDWORD $0 SHCTX "${UNINSTALL_REGISTRY_KEY}" EstimatedSize
    StrCmp $0 "42" 0 failed
    ReadINIStr $0 "$AppBackup\state.ini" transaction phase
    StrCmp $0 "rolled-back" 0 failed
  !endif
  DeleteRegKey HKCU "Software\HeyboxInstallerTest\${TEST_ID}"
  FileOpen $0 "${TEST_ROOT}\passed.txt" w
  FileWrite $0 "${TEST_CASE}"
  FileClose $0
  SetErrorLevel 0
  Quit
  failed:
    StrCpy $AppRollbackActive "0"
    DeleteRegKey HKCU "Software\HeyboxInstallerTest\${TEST_ID}"
    SetErrorLevel 3
    Quit
SectionEnd
