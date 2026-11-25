<?php
/**
 * VM Estúdio publication bridge. The existing newsletter integration owns delivery.
 */
if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', static function (): void {
    register_rest_route('vm-radar/v1', '/publication', [
        'methods' => WP_REST_Server::CREATABLE,
        'permission_callback' => 'vm_radar_studio_permission',
        'callback' => 'vm_radar_studio_publication',
    ]);
});

function vm_radar_studio_db(WP_REST_Request $request, string $resource, array $filters): array|WP_Error {
    $token = $request->get_header('x_vm_studio_authorization');
    $key = $request->get_header('x_vm_studio_apikey');
    if (!preg_match('/^Bearer [\w.-]{30,4000}$/D', $token) || !preg_match('/^[\w.-]{20,512}$/D', $key)) {
        return new WP_Error('vm_radar_session', 'Sessão do Estúdio inválida.', ['status' => 401]);
    }
    $url = 'https://ysepqedjtsyybfdtsdwr.supabase.co/' . $resource;
    if ($filters) {
        $url .= '?' . http_build_query($filters, '', '&', PHP_QUERY_RFC3986);
    }
    $result = wp_remote_get($url, [
        'timeout' => 8, 'redirection' => 0,
        'headers' => ['Authorization' => $token, 'apikey' => $key],
    ]);
    if (is_wp_error($result) || 200 !== wp_remote_retrieve_response_code($result)) {
        return new WP_Error('vm_radar_database', 'O Estúdio não confirmou o acesso.', ['status' => 403]);
    }
    $data = json_decode(wp_remote_retrieve_body($result), true);
    return is_array($data) ? $data : [];
}

function vm_radar_studio_permission(WP_REST_Request $request): bool|WP_Error {
    $auth = vm_radar_studio_db($request, 'auth/v1/user', []);
    if (is_wp_error($auth) || empty($auth['id'])) {
        return new WP_Error('vm_radar_auth', 'Entre no Estúdio para continuar.', ['status' => 401]);
    }
    $members = vm_radar_studio_db($request, 'rest/v1/users', [
        'id' => 'eq.' . $auth['id'], 'select' => 'workspace_id,role',
    ]);
    $member = is_array($members) ? ($members[0] ?? []) : [];
    return ('ws_vendamais' === ($member['workspace_id'] ?? '') && 'admin' === ($member['role'] ?? ''))
        ? true : new WP_Error('vm_radar_role', 'Acesso limitado aos administradores do Estúdio.', ['status' => 403]);
}

function vm_radar_studio_ready(): bool {
    if (!function_exists('vm_nl_settings')) {
        return false;
    }
    $settings = vm_nl_settings();
    foreach (['enabled','automation_vendamais','account_id','token','domain_id','sender','campaign_vendamais','list_vendamais'] as $key) {
        if (empty($settings[$key])) {
            return false;
        }
    }
    return (bool) get_term_by('slug', 'ezine', 'category');
}

function vm_radar_studio_status(WP_Post $post): array {
    $message_id = (string) get_post_meta($post->ID, VM_NL_META_MESSAGE_ID, true);
    $state = (string) get_post_meta($post->ID, VM_NL_META_MESSAGE_STATE, true);
    $locaweb = 'pending';
    if ('error' === $state) {
        $locaweb = 'error';
    } elseif ($message_id) {
        $locaweb = 'created';
        if ('publish' === $post->post_status) {
            $settings = vm_nl_settings();
            $path = '/accounts/' . rawurlencode((string) $settings['account_id']) . '/messages/' . rawurlencode($message_id);
            $overview = vm_nl_locaweb_request('GET', $path . '/overview');
            if (is_array($overview)) {
                $facts = [];
                vm_nl_collect_safe_status($overview, $facts);
                foreach ($facts as $key => $value) {
                    if (preg_match('/(?:^|\.)(?:sent|sent_count|delivered|delivered_count|total_sent)$/i', (string) $key)
                        && is_numeric($value) && (float) $value > 0) {
                        $locaweb = 'sent';
                        break;
                    }
                }
            }
        }
    }
    return ['wordpress' => ['id' => $post->ID, 'status' => $post->post_status,
        'date' => get_post_datetime($post)?->format(DATE_ATOM), 'link' => get_permalink($post)], 'locaweb' => $locaweb];
}

function vm_radar_studio_publication(WP_REST_Request $request): array|WP_Error {
    $action = (string) $request->get_param('action');
    if ('health' === $action) {
        return ['ready' => vm_radar_studio_ready()];
    }
    $edition_id = (string) $request->get_param('edition');
    if (!in_array($action, ['check','schedule'], true) || !preg_match('/^[a-zA-Z0-9_-]{1,90}$/D', $edition_id)) {
        return new WP_Error('vm_radar_request', 'Operação inválida.', ['status' => 400]);
    }
    $editions = vm_radar_studio_db($request, 'rest/v1/editions', [
        'id' => 'eq.' . $edition_id, 'select' => 'id,title,brief,exports',
    ]);
    $edition = is_array($editions) ? ($editions[0] ?? null) : null;
    if (!$edition || !defined('VM_NL_META_CHANNEL')) {
        return new WP_Error('vm_radar_edition', 'Edição indisponível.', ['status' => 404]);
    }
    $existing_id = absint($edition['exports']['wordpress_post_id'] ?? 0);
    $number = absint($edition['brief']['number'] ?? 0);
    $slug = 'radar-vendamais-news-' . $number;
    $query = new WP_Query([
        'post_type' => 'post', 'post_status' => ['draft','pending','future','publish','private','trash'],
        'name' => $slug, 'posts_per_page' => 1, 'no_found_rows' => true, 'ignore_sticky_posts' => true,
    ]);
    $post = $existing_id ? get_post($existing_id) : ($query->posts[0] ?? null);
    if ($post instanceof WP_Post) {
        if ('vendamais' !== get_post_meta($post->ID, VM_NL_META_CHANNEL, true)
            || (!$existing_id && $edition_id !== get_post_meta($post->ID, '_vm_studio_edition', true))) {
            return new WP_Error('vm_radar_existing', 'Confira o canal do artigo já registrado.', ['status' => 409]);
        }
        return vm_radar_studio_status($post);
    }
    if ('check' === $action) {
        return ['wordpress' => null, 'locaweb' => 'pending'];
    }
    if (!$number || empty($edition['brief']['radar_workflow']) || !vm_radar_studio_ready()) {
        return new WP_Error('vm_radar_config', 'WordPress ou Locaweb indisponível para programar.', ['status' => 503]);
    }
    $intents = vm_radar_studio_db($request, 'rest/v1/radar_publication_intents', [
        'edition_id' => 'eq.' . $edition_id, 'select' => 'plan,newsletter_version_id',
    ]);
    $intent = is_array($intents) ? ($intents[0] ?? []) : [];
    $datetime = (string) ($intent['plan']['newsletter'] ?? '');
    $local = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $datetime, new DateTimeZone('America/Sao_Paulo'));
    if (!$local || $local->format('Y-m-d\TH:i') !== $datetime || $local->getTimestamp() < time() + 240) {
        return new WP_Error('vm_radar_date', 'A programação aprovada precisa ter um horário futuro.', ['status' => 409]);
    }
    $versions = vm_radar_studio_db($request, 'rest/v1/newsletter_versions', [
        'id' => 'eq.' . ($intent['newsletter_version_id'] ?? ''), 'edition_id' => 'eq.' . $edition_id,
        'is_approved' => 'eq.true', 'select' => 'html,content_json',
    ]);
    $version = is_array($versions) ? ($versions[0] ?? []) : [];
    $headline = sanitize_text_field($version['content_json']['headline'] ?? '');
    $html = (string) ($version['html'] ?? '');
    $body = preg_match('/<body\b[^>]*>([\s\S]*?)<\/body>/i', $html, $match) ? $match[1] : $html;
    $body = wp_kses_post($body);
    if (!$headline || strlen(trim(wp_strip_all_tags($body))) < 60) {
        return new WP_Error('vm_radar_content', 'Não foi possível ler a versão aprovada.', ['status' => 409]);
    }
    $same_title = new WP_Query([
        'post_type' => 'post', 'post_status' => ['draft','pending','future','publish','private','trash'],
        'title' => $headline, 'posts_per_page' => 1, 'fields' => 'ids', 'no_found_rows' => true,
    ]);
    if ($same_title->posts) {
        return new WP_Error('vm_radar_duplicate', 'Já existe um artigo com esse título. Confira o WordPress.', ['status' => 409]);
    }
    $lock = 'vm_radar_studio_' . hash('sha256', $edition_id);
    if (!add_option($lock, time(), '', false)) {
        return new WP_Error('vm_radar_locked', 'O WordPress já recebeu esta programação. Confira o artigo.', ['status' => 409]);
    }
    $term = get_term_by('slug', 'ezine', 'category');
    $id = wp_insert_post(wp_slash([
        'post_type' => 'post', 'post_status' => 'future', 'post_name' => $slug,
        'post_title' => $headline, 'post_content' => $body, 'post_author' => (int) get_post_field('post_author', 72556),
        'post_date' => $local->setTimezone(wp_timezone())->format('Y-m-d H:i:s'),
        'post_date_gmt' => $local->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'),
        'post_category' => [(int) $term->term_id],
        'meta_input' => [VM_NL_META_CHANNEL => 'vendamais', '_jetpack_dont_email_post_to_subs' => true, '_vm_studio_edition' => $edition_id],
    ]), true);
    if (is_wp_error($id) || !$id) {
        return new WP_Error('vm_radar_create', 'O WordPress não confirmou o artigo. Confira antes de repetir.', ['status' => 502]);
    }
    $saved = get_post($id);
    if (!$saved || 'future' !== $saved->post_status
        || 'vendamais' !== get_post_meta($id, VM_NL_META_CHANNEL, true)
        || !get_post_meta($id, '_jetpack_dont_email_post_to_subs', true)
        || !has_category((int) $term->term_id, $saved)
        || get_post_datetime($saved)?->getTimestamp() !== $local->getTimestamp()) {
        return new WP_Error('vm_radar_verify', 'O WordPress exige conferência deste artigo.', ['status' => 502]);
    }
    return vm_radar_studio_status($saved);
}
