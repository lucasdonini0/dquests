; Ajustes do instalador do dQuests, incluído pelo electron-builder.

!macro customInstall
  ; o Windows guarda ícones em cache: pede para ele recarregar, senão um logo antigo continua aparecendo
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ClearErrors
!macroend
;
; Ao atualizar, o instalador roda o desinstalador da versão antiga. Se ele falhar,
; em vez de travar com "Failed to uninstall old application files", apagamos
; a pasta antiga à força e seguimos com a instalação. O save fica em %APPDATA%
; e não é tocado.

!macro dquestsForceRemoveOld
  ${if} $R0 != 0
    DetailPrint "Desinstalador antigo falhou ($R0). Removendo a versão antiga à força."
    RMDir /r "$INSTDIR"
    ClearErrors
  ${endif}
!macroend

!macro customUnInstallCheck
  !insertmacro dquestsForceRemoveOld
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro dquestsForceRemoveOld
!macroend
