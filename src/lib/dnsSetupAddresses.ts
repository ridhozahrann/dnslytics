import type { ResolverResult } from '../types/dns';

export interface SetupAddressInfo {
  title: string;
  androidDot?: string;
  ipv4?: string;
  dohUrl?: string;
  note: string;
}

export function getSetupAddresses(
  result: ResolverResult,
  nextDnsConfigId?: string,
): SetupAddressInfo {
  const id = result.resolver.id;
  const cleanNextDnsId = nextDnsConfigId?.trim() || '<id-anda>';

  if (id === 'nextdns-unified' || id.startsWith('nextdns-')) {
    const isUltraLow =
      id === 'nextdns-ultralow' ||
      result.resolver.variant.toLowerCase().includes('ultra low');
    const isAnycast =
      id === 'nextdns-anycast' ||
      result.resolver.variant.toLowerCase().includes('anycast');

    const dohHost = isUltraLow
      ? 'ultralow.dns.nextdns.io'
      : isAnycast
        ? 'anycast.dns.nextdns.io'
        : 'dns.nextdns.io';

    return {
      title: result.resolver.name,
      androidDot: `${cleanNextDnsId}.dns.nextdns.io`,
      dohUrl: `https://${dohHost}/${cleanNextDnsId}`,
      note: 'Atau pasang aplikasi resmi NextDNS di Android, iPhone, Windows, maupun Mac.',
    };
  }

  switch (id) {
    case 'cloudflare-1111':
      return {
        title: 'Cloudflare 1.1.1.1',
        androidDot: 'one.one.one.one',
        ipv4: '1.1.1.1  /  1.0.0.1',
        dohUrl: 'https://cloudflare-dns.com/dns-query',
        note: 'Bisa juga langsung memakai aplikasi 1.1.1.1 di Android atau iPhone.',
      };
    case 'cloudflare-security':
      return {
        title: 'Cloudflare Keamanan (1.1.1.2)',
        androidDot: 'security.cloudflare-dns.com',
        ipv4: '1.1.1.2  /  1.0.0.2',
        dohUrl: 'https://security.cloudflare-dns.com/dns-query',
        note: 'Memblokir situs berbahaya dan phishing secara otomatis.',
      };
    case 'google-public':
      return {
        title: 'Google DNS',
        androidDot: 'dns.google',
        ipv4: '8.8.8.8  /  8.8.4.4',
        dohUrl: 'https://dns.google/dns-query',
        note: 'Didukung otomatis hampir di semua router dan perangkat.',
      };
    case 'adguard-default':
      return {
        title: 'AdGuard DNS',
        androidDot: 'dns.adguard-dns.com',
        ipv4: '94.140.14.14  /  94.140.15.15',
        dohUrl: 'https://dns.adguard-dns.com/dns-query',
        note: 'Memblokir iklan dan pelacak otomatis di HP maupun browser.',
      };
    case 'adguard-unfiltered':
      return {
        title: 'AdGuard Tanpa Filter',
        androidDot: 'unfiltered.adguard-dns.com',
        ipv4: '94.140.14.140  /  94.140.14.141',
        dohUrl: 'https://unfiltered.adguard-dns.com/dns-query',
        note: 'Resolusi DNS murni tanpa pemblokiran iklan.',
      };
    case 'adguard-family':
      return {
        title: 'AdGuard Keluarga',
        androidDot: 'family.adguard-dns.com',
        ipv4: '94.140.14.15  /  94.140.15.16',
        dohUrl: 'https://family.adguard-dns.com/dns-query',
        note: 'Memblokir iklan sekaligus situs dewasa secara otomatis.',
      };
    case 'quad9-default':
      return {
        title: 'Quad9',
        androidDot: 'dns.quad9.net',
        ipv4: '9.9.9.9  /  149.112.112.112',
        dohUrl: 'https://dns.quad9.net/dns-query',
        note: 'Fokus keamanan untuk menangkal malware dan situs penipuan.',
      };
    case 'controld-free':
      return {
        title: 'Control D',
        androidDot: 'p0.freedns.controld.com',
        ipv4: '76.76.2.0  /  76.76.10.0',
        dohUrl: 'https://freedns.controld.com/p0',
        note: 'DNS publik gratis dari Control D.',
      };
    case 'controld-ads':
      return {
        title: 'Control D Blokir Iklan',
        androidDot: 'p2.freedns.controld.com',
        ipv4: '76.76.2.2  /  76.76.10.2',
        dohUrl: 'https://freedns.controld.com/p2',
        note: 'Memblokir iklan, pelacak, dan situs berbahaya.',
      };
    default:
      return {
        title: result.resolver.name,
        dohUrl: result.resolver.url || undefined,
        note: 'Masukkan alamat DoH ini pada pengaturan browser atau Windows 11.',
      };
  }
}
