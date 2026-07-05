param(
  [Parameter(Mandatory=$true)][string]$Title,
  [Parameter(Mandatory=$true)][string]$Body,
  [string]$OpenPath
)
try {
  [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime]

  $t = [System.Security.SecurityElement]::Escape($Title)
  $b = [System.Security.SecurityElement]::Escape($Body)
  $launchAttr = ''
  if ($OpenPath) {
    $uri = ([System.Uri]$OpenPath).AbsoluteUri
    $launchAttr = 'activationType="protocol" launch="' + [System.Security.SecurityElement]::Escape($uri) + '"'
  }
  $xmlText = "<toast $launchAttr duration=`"long`"><visual><binding template=`"ToastGeneric`"><text>$t</text><text>$b</text></binding></visual><audio src=`"ms-winsoundevent:Notification.Default`" /></toast>"

  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml($xmlText)
  $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
  $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
  Write-Error $_
  exit 1
}
