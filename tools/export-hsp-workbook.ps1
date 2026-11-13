param(
  [string]$WorkbookPath = 'C:\Users\SAMUEL\Downloads\HSP Master Data.xlsx',
  [string]$OutputPath = 'data/hsp-workbook.local.json'
)
$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $WorkbookPath).Path
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$book = $null
try {
  $book = $excel.Workbooks.Open($source, 0, $true)
  $sheets = @()
  foreach ($sheet in $book.Worksheets) {
    $range = $sheet.UsedRange
    $values = $range.Value2
    $rows = @()
    if ($range.Rows.Count -gt 1 -or $range.Columns.Count -gt 1) {
      for ($r = 1; $r -le $range.Rows.Count; $r++) {
        $cells = @()
        for ($c = 1; $c -le $range.Columns.Count; $c++) {
          $cells += $values[$r,$c]
        }
        $rows += ,$cells
      }
    }
    $sheets += @{ name = $sheet.Name; rows = $rows }
  }
  $payload = @{ version = 1; sha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash; sheets = $sheets }
  $target = [IO.Path]::GetFullPath($OutputPath)
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
  $payload | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $target -Encoding utf8
  $sheets | ForEach-Object { Write-Output ('{0}: {1} worksheet rows' -f $_.name, $_.rows.Count) }
} finally {
  if ($book) { $book.Close($false) }
  $excel.Quit()
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel) | Out-Null
}
