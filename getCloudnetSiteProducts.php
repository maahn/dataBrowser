<?php
// Returns the Cloudnet product ids for which the given site has at least one file.
// The Cloudnet API has no per-site product list, so each product is probed with limit=1.
header('Content-Type: application/json');

$site = $_GET['site'] ?? '';
if (!preg_match('/^[a-z0-9-]+$/i', $site)) {
    http_response_code(400);
    echo json_encode(['error' => 'Valid site parameter required']);
    exit;
}

$cacheFile = sys_get_temp_dir() . '/cloudnet_site_products_' . $site . '.json';
$cacheTtl = 86400;  // 24 hours
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtl) {
    readfile($cacheFile);
    exit;
}

function fetchJson($url) {
    $context = stream_context_create(['http' => ['timeout' => 15]]);
    $response = @file_get_contents($url, false, $context);
    return $response === false ? null : json_decode($response, true);
}

$products = fetchJson('https://cloudnet.fmi.fi/api/products');
if (!is_array($products)) {
    http_response_code(502);
    echo json_encode(['error' => 'Failed to fetch Cloudnet products']);
    exit;
}
$ids = array_column($products, 'id');

$available = [];
$failed = false;
if (function_exists('curl_multi_init')) {
    $mh = curl_multi_init();
    $handles = [];
    foreach ($ids as $id) {
        $ch = curl_init('https://cloudnet.fmi.fi/api/files?' . http_build_query(['site' => $site, 'product' => $id, 'limit' => 1]));
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20]);
        curl_multi_add_handle($mh, $ch);
        $handles[$id] = $ch;
    }
    do {
        curl_multi_exec($mh, $running);
        if ($running) curl_multi_select($mh, 1);
    } while ($running);
    foreach ($handles as $id => $ch) {
        $data = json_decode((string) curl_multi_getcontent($ch), true);
        if (!is_array($data)) $failed = true;
        elseif (count($data) > 0) $available[] = $id;
        curl_multi_remove_handle($mh, $ch);
    }
    curl_multi_close($mh);
} else {
    foreach ($ids as $id) {
        $data = fetchJson('https://cloudnet.fmi.fi/api/files?' . http_build_query(['site' => $site, 'product' => $id, 'limit' => 1]));
        if (!is_array($data)) $failed = true;
        elseif (count($data) > 0) $available[] = $id;
    }
}

if ($failed) {
    http_response_code(502);
    echo json_encode(['error' => 'Failed to probe all Cloudnet products']);
    exit;
}

$json = json_encode($available);
$tmpFile = $cacheFile . '.' . getmypid() . '.tmp';
if (file_put_contents($tmpFile, $json) !== false) rename($tmpFile, $cacheFile);
echo $json;
