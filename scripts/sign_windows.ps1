param(
  [Parameter(Mandatory = $true)]
  [string]$FilePath
)

$certificatePath = $env:WINDOWS_CERTIFICATE_PATH
$certificatePassword = $env:WINDOWS_CERTIFICATE_PASSWORD
$timestampUrl = $env:WINDOWS_SIGNING_TIMESTAMP_URL

if ([string]::IsNullOrWhiteSpace($certificatePath) -or [string]::IsNullOrWhiteSpace($certificatePassword)) {
  Write-Host "Windows signing skipped: certificate secrets not configured."
  exit 0
}

if (-not (Test-Path $certificatePath)) {
  throw "Windows signing certificate not found at $certificatePath"
}

if ([string]::IsNullOrWhiteSpace($timestampUrl)) {
  $timestampUrl = "http://timestamp.digicert.com"
}

$signTool = (Get-Command signtool.exe -ErrorAction Stop).Source

& $signTool sign `
  /f $certificatePath `
  /p $certificatePassword `
  /fd sha256 `
  /tr $timestampUrl `
  /td sha256 `
  $FilePath

if ($LASTEXITCODE -ne 0) {
  throw "signtool failed for $FilePath"
}
