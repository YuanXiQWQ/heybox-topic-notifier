; @file 在更新替换前保存旧版，失败时恢复文件和安装登记；无法恢复时保留可校验的备份。

; /**
;  * 保存或恢复应用拥有的一个注册表值，缺失值保留缺失状态。
;  * @param {string} ACTION Save 或 Restore。
;  * @param {string} TYPE Str 或 DWORD。
;  * @param {string} KEY 应用安装登记键。
;  * @param {string} GROUP 检查点中的分组名。
;  * @param {string} NAME 注册表值名。
;  */
!macro AppRegistryValue ACTION TYPE KEY GROUP NAME
  !if "${ACTION}" == "Save"
    ClearErrors
    ReadReg${TYPE} $0 SHELL_CONTEXT "${KEY}" "${NAME}"
    ${If} ${Errors}
      ClearErrors
      WriteINIStr "$AppBackup\registry.ini" "${GROUP}" "${NAME}.present" "0"
    ${Else}
      ClearErrors
      WriteINIStr "$AppBackup\registry.ini" "${GROUP}" "${NAME}.present" "1"
      WriteINIStr "$AppBackup\registry.ini" "${GROUP}" "${NAME}" "$0"
    ${EndIf}
    ${If} ${Errors}
      StrCpy $AppTreeOk "0"
    ${EndIf}
  !else
    ReadINIStr $0 "$AppBackup\registry.ini" "${GROUP}" "${NAME}.present"
    ${If} $0 == "1"
      ReadINIStr $0 "$AppBackup\registry.ini" "${GROUP}" "${NAME}"
      ClearErrors
      WriteReg${TYPE} SHELL_CONTEXT "${KEY}" "${NAME}" "$0"
      ${If} ${Errors}
        StrCpy $AppTreeOk "0"
      ${EndIf}
    ${Else}
      DeleteRegValue SHELL_CONTEXT "${KEY}" "${NAME}"
    ${EndIf}
  !endif
!macroend

; /**
;  * 处理安装器拥有的登记信息；不读写应用账号、偏好或用户 Run 项。
;  * @param {string} ACTION Save 或 Restore。
;  */
!macro AppRegistryCheckpoint ACTION
  !insertmacro AppRegistryValue ${ACTION} Str "${INSTALL_REGISTRY_KEY}" install InstallLocation
  !insertmacro AppRegistryValue ${ACTION} Str "${INSTALL_REGISTRY_KEY}" install KeepShortcuts
  !insertmacro AppRegistryValue ${ACTION} Str "${INSTALL_REGISTRY_KEY}" install ShortcutName
  !insertmacro AppRegistryValue ${ACTION} Str "${INSTALL_REGISTRY_KEY}" install MenuDirectory
  !insertmacro AppRegistryValue ${ACTION} Str "${UNINSTALL_REGISTRY_KEY}" uninstall DisplayName
  !insertmacro AppRegistryValue ${ACTION} Str "${UNINSTALL_REGISTRY_KEY}" uninstall DisplayVersion
  !insertmacro AppRegistryValue ${ACTION} Str "${UNINSTALL_REGISTRY_KEY}" uninstall DisplayIcon
  !insertmacro AppRegistryValue ${ACTION} Str "${UNINSTALL_REGISTRY_KEY}" uninstall UninstallString
  !insertmacro AppRegistryValue ${ACTION} Str "${UNINSTALL_REGISTRY_KEY}" uninstall QuietUninstallString
  !insertmacro AppRegistryValue ${ACTION} Str "${UNINSTALL_REGISTRY_KEY}" uninstall Publisher
  !insertmacro AppRegistryValue ${ACTION} Str "${UNINSTALL_REGISTRY_KEY}" uninstall Comments
  !insertmacro AppRegistryValue ${ACTION} Str "${UNINSTALL_REGISTRY_KEY}" uninstall HelpLink
  !insertmacro AppRegistryValue ${ACTION} Str "${UNINSTALL_REGISTRY_KEY}" uninstall URLInfoAbout
  !insertmacro AppRegistryValue ${ACTION} Str "${UNINSTALL_REGISTRY_KEY}" uninstall URLUpdateInfo
  !insertmacro AppRegistryValue ${ACTION} Str "${UNINSTALL_REGISTRY_KEY}" uninstall Readme
  !insertmacro AppRegistryValue ${ACTION} DWORD "${UNINSTALL_REGISTRY_KEY}" uninstall NoModify
  !insertmacro AppRegistryValue ${ACTION} DWORD "${UNINSTALL_REGISTRY_KEY}" uninstall NoRepair
  !insertmacro AppRegistryValue ${ACTION} DWORD "${UNINSTALL_REGISTRY_KEY}" uninstall EstimatedSize
!macroend

; /** 在安装器中注册备份、验证和恢复函数，不包含在卸载器中。 */
!macro AppRollbackFunctions
  ; 检查点固定为安装目录的同卷兄弟目录，完整路径和应用标识必须匹配才可处理。
  Var AppBackup
  Var AppRollbackActive
  Var AppTreeSource
  Var AppTreeTarget
  Var AppTreeMode
  Var AppTreeOk
  Var AppTreeCount
  Var AppBackupCount

  ; /**
  ;  * 递归复制并核对普通文件，拒绝重解析点；验证模式不写入目标。
  ;  * @param {string} stack 源目录内的相对路径。
  ;  * @return {number} $AppTreeOk 为 0 表示失败，$AppTreeCount 为已核对文件数。
  ;  */
  Function AppBackupTree
    Exch $0
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5
    System::Call 'kernel32::GetFileAttributesW(w "$AppTreeSource\$0") i.r3'
    IntCmp $3 -1 rootFailed
    IntOp $4 $3 & 0x400
    IntCmp $4 0 +2
      Goto rootFailed
    FindFirst $1 $2 "$AppTreeSource\$0*"
    loop:
      StrCmp $2 "" done
      StrCmp $2 "." next
      StrCmp $2 ".." next
      System::Call 'kernel32::GetFileAttributesW(w "$AppTreeSource\$0$2") i.r3'
      IntCmp $3 -1 failed
      IntOp $4 $3 & 0x400
      IntCmp $4 0 +2
        Goto failed
      IntOp $4 $3 & 0x10
      ${If} $4 != 0
        ${If} $AppTreeMode != "verify"
          CreateDirectory "$AppTreeTarget\$0$2"
        ${EndIf}
        Push "$0$2\"
        Call AppBackupTree
        ${If} $AppTreeOk != "1"
          Goto done
        ${EndIf}
      ${Else}
        ${StdUtils.HashFile} $3 "SHA2-256" "$AppTreeSource\$0$2"
        StrLen $4 $3
        StrCmp $4 64 0 failed
        ${If} $AppTreeMode == "backup"
          WriteINIStr "$AppBackup\hashes.ini" "files" "$0$2" "$3"
        ${Else}
          ReadINIStr $4 "$AppBackup\hashes.ini" "files" "$0$2"
          StrCmp $3 $4 0 failed
        ${EndIf}
        ${If} $AppTreeMode != "verify"
          ClearErrors
          CopyFiles /SILENT "$AppTreeSource\$0$2" "$AppTreeTarget\$0$2"
          IfErrors failed
          ${StdUtils.HashFile} $4 "SHA2-256" "$AppTreeTarget\$0$2"
          StrCmp $3 $4 0 failed
        ${EndIf}
        IntOp $AppTreeCount $AppTreeCount + 1
      ${EndIf}
    next:
      FindNext $1 $2
      Goto loop
    failed:
      System::Call 'kernel32::GetLastError() i.r5'
      !insertmacro AppInstallLog "tree-failed: $AppTreeMode $0$2 error=$5"
      StrCpy $AppTreeOk "0"
    done:
      FindClose $1
      Goto restoreRegisters
    rootFailed:
      !insertmacro AppInstallLog "tree-root-invalid: $AppTreeMode $0"
      StrCpy $AppTreeOk "0"
    restoreRegisters:
      Pop $5
      Pop $4
      Pop $3
      Pop $2
      Pop $1
      Pop $0
  FunctionEnd

  ; /**
  ;  * 核对完整备份后恢复旧文件和登记，备份或写入失败时保留检查点。
  ;  * @return {number} $AppTreeOk 为 1 表示恢复完成。
  ;  */
  Function AppRollback
    ${If} $AppRollbackActive != "1"
      Return
    ${EndIf}
    StrCpy $AppRollbackActive "0"
    FileOpen $0 "$AppBackup\failure.json" w
    FileWrite $0 '{$\"version$\":$\"${VERSION}$\"}'
    FileClose $0
    StrCpy $AppTreeOk "1"
    ReadINIStr $1 "$AppBackup\state.ini" transaction registryDigest
    StrLen $2 $1
    ${StdUtils.HashFile} $0 "SHA2-256" "$AppBackup\registry.ini"
    ${If} $2 != 64
    ${OrIf} $0 != $1
      StrCpy $AppTreeOk "0"
      !insertmacro AppInstallLog "rollback-registry-backup-invalid"
      Return
    ${EndIf}
    StrCpy $AppTreeCount 0
    StrCpy $AppTreeMode "verify"
    StrCpy $AppTreeSource "$AppBackup\files"
    Push ""
    Call AppBackupTree
    ${If} $AppTreeOk != "1"
    ${OrIf} $AppTreeCount != $AppBackupCount
      StrCpy $AppTreeOk "0"
      !insertmacro AppInstallLog "rollback-backup-invalid"
      Return
    ${EndIf}
    SetOutPath $TEMP
    ReadINIStr $0 "$AppBackup\state.ini" transaction phase
    ; 完整性失败的新文件另存于同一受管检查点，不覆盖旧版备份。
    ${If} $0 != "restoring"
    ${AndIf} ${FileExists} "$INSTDIR\*"
      ${If} ${FileExists} "$AppBackup\failed\*"
        StrCpy $AppTreeOk "0"
        !insertmacro AppInstallLog "rollback-target-conflict"
        Return
      ${EndIf}
      ClearErrors
      Rename "$INSTDIR" "$AppBackup\failed"
      ${If} ${Errors}
        StrCpy $AppTreeOk "0"
        !insertmacro AppInstallLog "rollback-target-busy"
        Return
      ${EndIf}
    ${EndIf}
    WriteINIStr "$AppBackup\state.ini" transaction phase "restoring"
    CreateDirectory "$INSTDIR"
    StrCpy $AppTreeMode "restore"
    StrCpy $AppTreeTarget "$INSTDIR"
    StrCpy $AppTreeCount 0
    Push ""
    Call AppBackupTree
    ${If} $AppTreeOk == "1"
    ${AndIf} $AppTreeCount == $AppBackupCount
      !insertmacro AppRegistryCheckpoint Restore
    ${Else}
      StrCpy $AppTreeOk "0"
    ${EndIf}
    ${If} $AppTreeOk == "1"
      WriteINIStr "$AppBackup\state.ini" transaction phase "rolled-back"
      !insertmacro AppInstallLog "rollback-complete"
    ${Else}
      !insertmacro AppInstallLog "rollback-write-failed"
    ${EndIf}
  FunctionEnd

  ; /**
  ;  * 在旧卸载器运行前建立经校验的同卷备份，不能备份则不开始替换。
  ;  * 中断留下的完整检查点先恢复；不接管标识、路径或安装范围不匹配的目录。
  ;  */
  Function AppPrepareRollback
    ${IfNot} ${isUpdated}
      Return
    ${EndIf}
    ${If} $installMode == "all"
    ${AndIfNot} ${UAC_IsAdmin}
      Return
    ${EndIf}
    GetFullPathName $INSTDIR "$INSTDIR"
    ${GetRoot} "$INSTDIR" $0
    StrCmp "$INSTDIR" "$0\" failed
    ${GetParent} "$INSTDIR" $0
    ${If} $0 == ""
      Goto failed
    ${EndIf}
    StrCpy $AppBackup "$INSTDIR.heybox-update-backup"
    System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR") i.r0'
    ${If} $0 != -1
      IntOp $0 $0 & 0x400
      IntCmp $0 0 +2
        Goto failed
    ${EndIf}
    System::Call 'kernel32::GetFileAttributesW(w "$AppBackup") i.r0'
    ${If} $0 != -1
      IntOp $0 $0 & 0x400
      IntCmp $0 0 +2
        Goto failed
    ${EndIf}
    ${If} ${FileExists} "$AppBackup\*"
      ReadINIStr $0 "$AppBackup\state.ini" transaction owner
      StrCmp $0 "${APP_ID}" 0 failed
      ReadINIStr $0 "$AppBackup\state.ini" transaction target
      StrCmp $0 "$INSTDIR" 0 failed
      ReadINIStr $0 "$AppBackup\state.ini" transaction mode
      StrCmp $0 "$installMode" 0 failed
      ReadINIStr $0 "$AppBackup\state.ini" transaction phase
      ${If} $0 == "prepared"
      ${OrIf} $0 == "restoring"
        ReadINIStr $AppBackupCount "$AppBackup\state.ini" transaction count
        StrCpy $AppRollbackActive "1"
        Call AppRollback
        ; 恢复后先结束本次更新，让用户检查旧版状态，不在同次运行中再次替换。
        ${If} $AppTreeOk == "1"
          MessageBox MB_OK|MB_ICONINFORMATION "$(AppRestoreComplete)"
        ${Else}
          MessageBox MB_OK|MB_ICONSTOP "$(AppRestoreIncomplete)$\r$\n$AppBackup"
        ${EndIf}
        SetErrorLevel 2
        Quit
      ${EndIf}
      ${If} $0 != "copying"
      ${AndIf} $0 != "rolled-back"
      ${AndIf} $0 != "committed"
        Goto failed
      ${EndIf}
      ; 完整路径及所有权已核对，只清理本应用安装目录旁的专用检查点。
      RMDir /r "$AppBackup"
      ${If} ${FileExists} "$AppBackup\*"
        Goto failed
      ${EndIf}
    ${EndIf}
    ${IfNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      Goto failed
    ${EndIf}
    CreateDirectory "$AppBackup\files"
    WriteINIStr "$AppBackup\state.ini" transaction owner "${APP_ID}"
    WriteINIStr "$AppBackup\state.ini" transaction target "$INSTDIR"
    WriteINIStr "$AppBackup\state.ini" transaction mode "$installMode"
    WriteINIStr "$AppBackup\state.ini" transaction phase "copying"
    StrCpy $AppTreeOk "1"
    !insertmacro AppRegistryCheckpoint Save
    ${If} $AppTreeOk != "1"
      Goto failed
    ${EndIf}
    ${StdUtils.HashFile} $0 "SHA2-256" "$AppBackup\registry.ini"
    StrLen $1 $0
    StrCmp $1 64 0 failed
    WriteINIStr "$AppBackup\state.ini" transaction registryDigest "$0"
    ReadINIStr $1 "$AppBackup\state.ini" transaction registryDigest
    StrCmp $0 $1 0 failed
    StrCpy $AppTreeSource "$INSTDIR"
    StrCpy $AppTreeTarget "$AppBackup\files"
    StrCpy $AppTreeMode "backup"
    StrCpy $AppTreeOk "1"
    StrCpy $AppTreeCount 0
    Push ""
    Call AppBackupTree
    ${If} $AppTreeOk != "1"
    ${OrIf} $AppTreeCount == 0
      Goto failed
    ${EndIf}
    StrCpy $AppBackupCount $AppTreeCount
    StrCpy $AppTreeSource "$AppBackup\files"
    StrCpy $AppTreeMode "verify"
    StrCpy $AppTreeCount 0
    Push ""
    Call AppBackupTree
    ${If} $AppTreeOk != "1"
    ${OrIf} $AppTreeCount != $AppBackupCount
      Goto failed
    ${EndIf}
    WriteINIStr "$AppBackup\state.ini" transaction count "$AppBackupCount"
    ReadINIStr $0 "$AppBackup\state.ini" transaction count
    StrCmp $0 $AppBackupCount 0 failed
    WriteINIStr "$AppBackup\state.ini" transaction phase "prepared"
    ReadINIStr $0 "$AppBackup\state.ini" transaction phase
    StrCmp $0 "prepared" 0 failed
    StrCpy $AppRollbackActive "1"
    !insertmacro AppInstallLog "rollback-prepared"
    Return
    failed:
      !insertmacro AppInstallLog "rollback-prepare-failed"
      MessageBox MB_OK|MB_ICONSTOP "$(decompressionFailed)"
      SetErrorLevel 2
      Quit
  FunctionEnd

  ; /** 成功安装后提交检查点，清理失败不会将成功的新版本回滚。 */
  Function AppCommitRollback
    ${If} $AppRollbackActive == "1"
      WriteINIStr "$AppBackup\state.ini" transaction phase "committed"
      ReadINIStr $0 "$AppBackup\state.ini" transaction phase
      ${If} $0 != "committed"
        !insertmacro AppInstallLog "rollback-commit-failed"
        Call AppRollback
        SetErrorLevel 2
        Quit
      ${EndIf}
      StrCpy $AppRollbackActive "0"
      RMDir /r "$AppBackup"
    ${EndIf}
  FunctionEnd

  ; /** 安装流程失败时尝试一次恢复，保留无法恢复的检查点。 */
  Function .onInstFailed
    Call AppRollback
  FunctionEnd

  ; /** 取消或提前退出安装时，未提交的替换必须恢复。 */
  Function .onGUIEnd
    Call AppRollback
  FunctionEnd
!macroend
