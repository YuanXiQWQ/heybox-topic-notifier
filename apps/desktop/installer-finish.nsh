; @file 在原生安装完成页提供默认关闭的桌面入口和当前用户开机启动选项。
!include /CHARSET=UTF8 "${__FILEDIR__}\installer-messages.nsh"

; /** 保留原生完成页及打开应用选项，在首次安装时增加两个独立复选框。 */
!macro customFinishPage
  ; 已有安装不显示首次安装选项，也不重新创建用户移除的入口。
  Var AppExistingInstall
  ; 完成页复选框句柄不作为持久化偏好，更新时不读取或重置这些选项。
  Var AppFinishDesktop
  Var AppFinishStartup
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION StartApp
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW AppFinishShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE AppFinishLeave
  !insertmacro MUI_PAGE_FINISH

  ; /** 按完成页或静默更新的启动请求，以当前交互用户身份打开应用。 */
  Function StartApp
    StrCpy $1 ""
    ${If} ${isUpdated}
      StrCpy $1 "--updated"
    ${EndIf}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  ; /** 使用原生完成页的字体与颜色显示首次安装选项，默认均不勾选。 */
  Function AppFinishShow
    ${If} $AppExistingInstall == "1"
    ${OrIf} ${isUpdated}
      Return
    ${EndIf}
    ${NSD_CreateCheckbox} 120u 135u 195u 12u "$(AppCreateDesktop)"
    Pop $AppFinishDesktop
    SetCtlColors $AppFinishDesktop "${MUI_TEXTCOLOR}" "${MUI_BGCOLOR}"
    ${NSD_Uncheck} $AppFinishDesktop
    ${NSD_CreateCheckbox} 120u 155u 195u 12u "$(AppEnableStartup)"
    Pop $AppFinishStartup
    SetCtlColors $AppFinishStartup "${MUI_TEXTCOLOR}" "${MUI_BGCOLOR}"
    ${NSD_Uncheck} $AppFinishStartup
  FunctionEnd

  ; /**
  ;  * 在原始交互用户上下文中启用与应用设置相同的 Run 项。
  ;  * @return {number} $R0 为 1 表示写入已核对，0 表示未能写入。
  ;  */
  Function AppEnableUserStartup
    StrCpy $R0 "0"
    ClearErrors
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\"'
    ${IfNot} ${Errors}
      ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
      ${If} $R1 == '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\"'
        StrCpy $R0 "1"
      ${EndIf}
    ${EndIf}
  FunctionEnd

  ; /** 仅执行用户勾选的首次安装操作，失败时留在完成页供检查或重试。 */
  Function AppFinishLeave
    ${If} $AppExistingInstall == "1"
    ${OrIf} ${isUpdated}
      Return
    ${EndIf}
    ${NSD_GetState} $AppFinishDesktop $0
    ${If} $0 == ${BST_CHECKED}
      ClearErrors
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0
      ${If} ${Errors}
        MessageBox MB_OK|MB_ICONEXCLAMATION "$(AppOptionsFailed)"
        Abort
      ${EndIf}
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${EndIf}
    ${NSD_GetState} $AppFinishStartup $0
    ${If} $0 == ${BST_CHECKED}
      !insertmacro UAC_AsUser_Call Function AppEnableUserStartup ${UAC_SYNCREGISTERS}|${UAC_SYNCINSTDIR}
      ${If} $R0 != "1"
        MessageBox MB_OK|MB_ICONEXCLAMATION "$(AppOptionsFailed)"
        Abort
      ${EndIf}
    ${EndIf}
  FunctionEnd
!macroend
