; @file 在安装目录页显示完整目标路径，并在开始安装前确认手动输入的父目录。
; InstallDir 的末级目录供 NSIS 浏览对话框自动追加；实际默认位置仍由安装模式和已有安装记录决定。
InstallDir "$LOCALAPPDATA\Programs\${APP_FILENAME}"

!include "FileFunc.nsh"
!include "WinMessages.nsh"

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
