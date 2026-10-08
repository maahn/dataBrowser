<?php
// Returns the entry names of an Apache-style directory listing as a JSON array.
// Only https hosts that appear in config.json are allowed (no open proxy).
header('Content-Type: application/json');

$url = $_GET['url'] ?? '';
$parts = parse_url($url);

$config = json_decode(file_get_contents(__DIR__ . '/config.json'), true);
$allowedHosts = [];
foreach (($config['sites'] ?? []) as $site) {
    foreach (($site['dataStrings'] ?? []) as $format) {
        if (preg_match('#https://([^/\']+)#', $format, $m)) {
            $allowedHosts[$m[1]] = true;
        }
    }
}

if (!$parts || ($parts['scheme'] ?? '') !== 'https' || !isset($allowedHosts[$parts['host'] ?? ''])
    || isset($parts['query']) || strpos($url, '..') !== false || substr($url, -1) !== '/') {
    http_response_code(400);
    echo json_encode(['error' => 'URL not allowed']);
    exit;
}

$context = stream_context_create(['http' => ['timeout' => 15]]);
$html = @file_get_contents($url, false, $context);
if ($html === false) {
    // 404 = directory does not exist; anything else = remote problem
    $headers = function_exists('http_get_last_response_headers') ? http_get_last_response_headers() : ($http_response_header ?? []);
    $status = isset($headers[0]) && preg_match('# (\d{3})#', $headers[0], $m) ? (int)$m[1] : 0;
    http_response_code($status === 404 ? 404 : 502);
    echo json_encode(['error' => 'Listing not available']);
    exit;
}

$names = [];
if (preg_match_all('/<a href="([^"]+)"/i', $html, $matches)) {
    foreach ($matches[1] as $href) {
        // skip sort links, absolute paths (parent dir) and external links
        if ($href[0] === '?' || $href[0] === '/' || strpos($href, ':') !== false) continue;
        $names[] = urldecode($href);
    }
}
echo json_encode($names);
