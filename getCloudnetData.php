<?php
header("Content-Type: application/json");

$site = $_GET['site'] ?? '';
$date = $_GET['date'] ?? '';
$dateFrom = $_GET['dateFrom'] ?? '';
$dateTo = $_GET['dateTo'] ?? '';
$variable = $_GET['variable'] ?? '';
$isDate = function ($d) { return preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) === 1; };

// Either a single date, or a date range (optionally restricted to one product variable)
$validDates = $date !== '' ? $isDate($date) : ($isDate($dateFrom) && $isDate($dateTo));
if (!preg_match('/^[a-z0-9-]+$/i', $site) || !$validDates ||
    ($variable !== '' && !preg_match('/^[a-z0-9_-]+$/i', $variable))) {
    http_response_code(400);
    echo json_encode(['error' => 'Valid site and date (yyyy-mm-dd) or dateFrom/dateTo parameters required']);
    exit;
}

$query = ['site' => $site];
if ($date !== '') {
    $query['date'] = $date;
} else {
    $query['dateFrom'] = $dateFrom;
    $query['dateTo'] = $dateTo;
}
if ($variable !== '') $query['variable'] = $variable;
$url = "https://cloudnet.fmi.fi/api/visualizations/?" . http_build_query($query);
$context = stream_context_create(['http' => ['timeout' => 15]]);
$response = @file_get_contents($url, false, $context);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Failed to fetch data from Cloudnet API']);
    exit;
}

echo $response;
