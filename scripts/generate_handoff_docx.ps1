param(
  [string]$MarkdownPath = (Join-Path $PSScriptRoot "..\\HANDOFF_CLAUDE_CODE_2026-04-10.md"),
  [string]$DocxPath = (Join-Path $PSScriptRoot "..\\HANDOFF_CLAUDE_CODE_2026-04-10.docx")
)

$ErrorActionPreference = "Stop"

function Escape-Xml {
  param([string]$Text)
  return [System.Security.SecurityElement]::Escape($Text)
}

$markdownFullPath = (Resolve-Path $MarkdownPath).Path
$docxFullPath = [System.IO.Path]::GetFullPath($DocxPath)

$tempDir = Join-Path $env:TEMP ("glutec-docx-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $tempDir "_rels") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $tempDir "docProps") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $tempDir "word") | Out-Null

$lines = Get-Content -Path $markdownFullPath -Encoding UTF8
$paragraphList = New-Object System.Collections.Generic.List[string]

foreach ($line in $lines) {
  if ($line -eq "") {
    $paragraphList.Add("<w:p/>")
    continue
  }

  if ($line.StartsWith("# ")) {
    $content = Escape-Xml $line.Substring(2)
    $paragraphList.Add("<w:p><w:pPr><w:pStyle w:val=`"Heading1`"/></w:pPr><w:r><w:t xml:space=`"preserve`">$content</w:t></w:r></w:p>")
    continue
  }

  if ($line.StartsWith("## ")) {
    $content = Escape-Xml $line.Substring(3)
    $paragraphList.Add("<w:p><w:pPr><w:pStyle w:val=`"Heading2`"/></w:pPr><w:r><w:t xml:space=`"preserve`">$content</w:t></w:r></w:p>")
    continue
  }

  if ($line.StartsWith("### ")) {
    $content = Escape-Xml $line.Substring(4)
    $paragraphList.Add("<w:p><w:pPr><w:pStyle w:val=`"Heading3`"/></w:pPr><w:r><w:t xml:space=`"preserve`">$content</w:t></w:r></w:p>")
    continue
  }

  $contentLine = $line
  if ($line.StartsWith("- ")) {
    $contentLine = "• " + $line.Substring(2)
  }

  $content = Escape-Xml $contentLine
  $paragraphList.Add("<w:p><w:r><w:t xml:space=`"preserve`">$content</w:t></w:r></w:p>")
}

$paragraphs = $paragraphList -join "`n    "

$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">
  <w:body>
    $paragraphs
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
"@

$contentTypes = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
"@

$rels = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"@

$appXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Codex</Application>
</Properties>
"@

$coreXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Handoff Claude Code - Glutec Clinica</dc:title>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
</cp:coreProperties>
"@

$stylesXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:rPr>
      <w:rFonts w:ascii="Montserrat" w:hAnsi="Montserrat"/>
      <w:sz w:val="22"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
</w:styles>
"@

[System.IO.File]::WriteAllText((Join-Path $tempDir "[Content_Types].xml"), $contentTypes, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $tempDir "_rels\\.rels"), $rels, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $tempDir "docProps\\app.xml"), $appXml, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $tempDir "docProps\\core.xml"), $coreXml, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $tempDir "word\\document.xml"), $documentXml, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $tempDir "word\\styles.xml"), $stylesXml, [System.Text.Encoding]::UTF8)

if (Test-Path $docxFullPath) {
  Remove-Item -LiteralPath $docxFullPath -Force
}

$zipPath = Join-Path $env:TEMP ("glutec-docx-package-" + [guid]::NewGuid().ToString() + ".zip")
if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath $zipPath -Force
[System.IO.File]::Copy($zipPath, $docxFullPath, $true)
Remove-Item -LiteralPath $zipPath -Force
Remove-Item -LiteralPath $tempDir -Recurse -Force

Write-Output $docxFullPath
