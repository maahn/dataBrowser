<?php
header('Content-Type: application/json');

$cacheFile = sys_get_temp_dir() . '/cloudnet_products_variables.json';
$cacheTtl = 86400;  // 24 hours — product list rarely changes

if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtl) {
    readfile($cacheFile);
    exit;
}

$context = stream_context_create(['http' => ['timeout' => 15]]);
$response = @file_get_contents("https://cloudnet.fmi.fi/api/products/variables", false, $context);

if ($response === false || !is_array(json_decode($response, true))) {
    // Serve a stale cache rather than failing if the API is down
    if (file_exists($cacheFile)) {
        readfile($cacheFile);
        exit;
    }
    http_response_code(502);
    echo json_encode(["error" => "Failed to fetch Cloudnet product variables"]);
    exit;
}

// Write atomically so concurrent requests never read a half-written file
$tmpFile = $cacheFile . '.' . getmypid() . '.tmp';
if (file_put_contents($tmpFile, $response) !== false) {
    rename($tmpFile, $cacheFile);
}
echo $response;
