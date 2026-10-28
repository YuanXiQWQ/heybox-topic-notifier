; @file 处理静默升级、安装完整性与启动入口，并在目录页显示完整目标路径。
; InstallDir 的末级目录供 NSIS 浏览对话框自动追加；实际默认位置仍由安装模式和已有安装记录决定。
InstallDir "$LOCALAPPDATA\Programs\${APP_FILENAME}"

!include "FileFunc.nsh"
!include "WinMessages.nsh"
; 快捷方式只由首次安装的明确选择创建，更新流程不补建任何入口。
!define DO_NOT_CREATE_DESKTOP_SHORTCUT
!define DO_NOT_CREATE_START_MENU_SHORTCUT
!include /CHARSET=UTF8 "${__FILEDIR__}\installer-finish.nsh"
!include /CHARSET=UTF8 "${__FILEDIR__}\installer-rollback.nsh"
; 编译期校验清单来自构建器实际使用的 x64 归档，不依赖安装时残留的解包目录。
!define AppInstallerSource "${__FILEDIR__}"

; /**
;  * 将安装阶段记录到当前用户临时目录，不记录账号、令牌或用户数据。
;  * @param {string} STAGE 安装阶段或失败原因。
;  */
!macro AppInstallLog STAGE
  Push $0
  ClearErrors
  FileOpen $0 "$TEMP\heybox-topic-notifier-install.log" a
  ${IfNot} ${Errors}
    FileSeek $0 0 END
    FileWrite $0 "${VERSION} ${STAGE}$\r$\n"
    FileClose $0
  ${EndIf}
  Pop $0
!macroend

; /** 在安装器完成插件路径初始化后注册文件校验函数。 */
!macro customHeader
!ifndef BUILD_UNINSTALLER
  !ifndef APP_64
    !error "The application installer currently requires the x64 package."
  !endif
  !tempfile AppPayloadManifest
  !system 'node "${AppInstallerSource}\installer-payload.cjs" "${APP_64}" "${AppPayloadManifest}" "${UNINSTALLER_OUT_FILE}" "${UNINSTALL_FILENAME}"' = 0
  !include /CHARSET=UTF8 "${AppPayloadManifest}"
  !delfile "${AppPayloadManifest}"
  !undef AppPayloadManifest
  ; 当前文件的预期摘要由归档生成的校验宏设置。
  Var AppExpectedDigest
  !insertmacro AppRollbackFunctions
  ; /** 安装失败时恢复旧版，并按恢复结果明确报错，禁止启动不完整的新版本。 */
  Function AppFailInstall
    Call AppRollback
    ${If} $AppBackup != ""
      ${If} $AppTreeOk == "1"
        MessageBox MB_OK|MB_ICONSTOP "$(AppRestoreComplete)"
      ${Else}
        MessageBox MB_OK|MB_ICONSTOP "$(AppRestoreIncomplete)$\r$\n$AppBackup"
      ${EndIf}
    ${Else}
      MessageBox MB_OK|MB_ICONSTOP "$(decompressionFailed)"
    ${EndIf}
    SetErrorLevel 2
    Quit
  FunctionEnd
  ; /**
  ;  * 按编译期归档摘要核对文件，只有解包参照也符合摘要时才尝试重新复制。
  ;  * @param {string} stack 安装目录内的相对文件路径。
  ;  * @return {string} 栈顶 1 表示 SHA-256 一致，0 表示无法恢复或校验。
  ;  */
  Function AppVerifyInstalledFile
    Exch $0
    Push $1
    Push $2
    Push $3
    StrCpy $3 "$0"
    ${StdUtils.HashFile} $2 "SHA2-256" "$INSTDIR\$3"
    StrCmp $AppExpectedDigest $2 verified
    ${StdUtils.HashFile} $1 "SHA2-256" "$PLUGINSDIR\7z-out\$3"
    StrCmp $AppExpectedDigest $1 referenceReady
    !insertmacro AppInstallLog "reference-unavailable: $3"
    Goto failed
    referenceReady:
    !insertmacro AppInstallLog "repair-copy: $3"
    CopyFiles /SILENT "$PLUGINSDIR\7z-out\$3" "$INSTDIR\$3"
    ${StdUtils.HashFile} $2 "SHA2-256" "$INSTDIR\$3"
    StrCmp $1 $2 verified
    !insertmacro AppInstallLog "repair-failed: $3"
    failed:
      StrCpy $0 "0"
      Goto done
    verified:
      StrCpy $0 "1"
    done:
      Pop $3
      Pop $2
      Pop $1
      Exch $0
  FunctionEnd
!endif
!macroend

; /**
;  * 关键文件无法验证时报告失败，禁止把不完整安装当作成功并启动应用。
;  * @param {string} RELATIVE_PATH 安装目录内必须校验的文件路径。
;  * @param {string} DIGEST 编译期计算的发行文件 SHA-256。
;  */
!macro AppRequireInstalledFile RELATIVE_PATH DIGEST
  Push $0
  StrCpy $AppExpectedDigest "${DIGEST}"
  Push "${RELATIVE_PATH}"
  Call AppVerifyInstalledFile
  Pop $0
  ${If} $0 != "1"
    !insertmacro AppInstallLog "validation-failed: ${RELATIVE_PATH}"
    Pop $0
    Call AppFailInstall
  ${EndIf}
  Pop $0
!macroend

; /** 应用发起的更新直接静默执行，安装范围和目录由已有安装记录确定。 */
!macro customInit
  !insertmacro AppInstallLog "begin"
  !insertmacro setLinkVars
  StrCpy $AppExistingInstall "0"
  ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $1 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 != ""
  ${OrIf} $1 != ""
    StrCpy $AppExistingInstall "1"
  ${EndIf}
  ${If} ${isUpdated}
    SetSilent silent
  ${EndIf}
  Call AppPrepareRollback
!macroend

; /** 校验全部归档文件后提交更新；仅首次安装添加开始菜单入口。 */
!macro customInstall
  !insertmacro AppVerifyPayload
  ReadRegStr $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $1 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
  ${If} $0 != "$INSTDIR"
  ${OrIf} $1 != "${VERSION}"
    !insertmacro AppInstallLog "registry-verification-failed"
    Call AppFailInstall
  ${EndIf}
  ${If} $AppExistingInstall == "0"
  ${AndIfNot} ${isUpdated}
    !insertmacro createMenuDirectory
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${EndIf}
  Call AppCommitRollback
  !insertmacro AppInstallLog "files-verified"
!macroend

; /** 用户主动卸载时清理应用入口；更新卸载保留原有入口及其缺失状态。 */
!macro customUnInstall
  ${IfNot} ${isUpdated}
    Delete "$oldDesktopLink"
    Delete "$oldStartMenuLink"
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
    ${If} $0 == '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\"'
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
    ${EndIf}
  ${EndIf}
!macroend

; /** 使用原生目录页，在用户确认前补全路径；更新安装沿用已有目录并跳过此页。 */
!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_PRE AppDirectoryPre
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE AppDirectoryLeave
  !insertmacro MUI_PAGE_DIRECTORY

  ; /** 补全应用目录，保留安装记录中的自定义位置，避免重复追加末级目录。 */
  Function AppNormalizeDirectory
    Push $0
    Push $1
    StrCpy $0 $INSTDIR
    StrCmp $0 "" done
    StrCmp $0 $perUserInstallationFolder done
    StrCmp $0 $perMachineInstallationFolder done
    trim:
      StrCpy $1 $0 1 -1
      StrCmp $1 "\" removeTrailing
      StrCmp $1 "/" removeTrailing append
    removeTrailing:
      StrCpy $0 $0 -1
      StrCmp $0 "" done trim
    append:
      ${GetFileName} "$0" $1
      StrCmp $1 "${APP_FILENAME}" normalized
      StrCpy $0 "$0\${APP_FILENAME}"
    normalized:
      StrCpy $INSTDIR "$0\"
    done:
      Pop $1
      Pop $0
  FunctionEnd

  ; /** 首次显示目录页时提供完整的目标路径，不影响自动更新或静默安装。 */
  Function AppDirectoryPre
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    Call AppNormalizeDirectory
  FunctionEnd

  ; /** 手动输入父目录时先回显补全结果并留在当前页，确认后才允许开始安装。 */
  Function AppDirectoryLeave
    Push $0
    Push $1
    SendMessage $mui.DirectoryPage.Directory ${WM_GETTEXT} ${NSIS_MAX_STRLEN} "STR:$INSTDIR"
    StrCpy $0 $INSTDIR
    Call AppNormalizeDirectory
    ; 尾部分隔符不改变目标目录，不要求用户重复确认。
    StrCpy $1 "$0\"
    StrCmp $0 $INSTDIR confirmed
    StrCmp $1 $INSTDIR confirmed
    SendMessage $mui.DirectoryPage.Directory ${WM_SETTEXT} 0 "STR:$INSTDIR"
    System::Call 'user32::SetFocus(p $mui.DirectoryPage.Directory)'
    SendMessage $mui.DirectoryPage.Directory ${EM_SETSEL} 0 -1
    Pop $1
    Pop $0
    Abort
    confirmed:
      Pop $1
      Pop $0
  FunctionEnd
!macroend
