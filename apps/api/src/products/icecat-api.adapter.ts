/**
 * Adaptador para Icecat Full API
 * Estructura lista para cuando recibas credenciales
 * Endpoint esperado: https://live.icecat.biz/api/ (iQuery)
 */

import axios from 'axios';

export interface IcecatApiConfig {
  username: string;
  password: string;
  language?: string; // ej. 'es'
  responseType?: 'json' | 'xml'; // preferencia, Icecat usa XML nativo
}

export interface IcecatProductMatch {
  mpn: string;
  brand: string;
  icecatId: string;
  title: string;
  description?: string;
  specs?: Record<string, string | number>;
  images?: {
    thumb?: string;
    large?: string;
    hd?: string;
  };
  datasheet?: string;
}

export class IcecatApiAdapter {
  private config: IcecatApiConfig;
  private baseUrl = 'https://live.icecat.biz/api';
  private readonly timeout = 10000;

  constructor(config: IcecatApiConfig) {
    this.config = {
      language: 'es',
      responseType: 'json',
      ...config,
    };

    if (!this.config.username || !this.config.password) {
      console.warn(
        '[IcecatApiAdapter] No credentials provided. Skipping initialization. Waiting for ICECAT_USERNAME/PASSWORD in .env',
      );
    }
  }

  /**
   * Buscar producto en Icecat por MPN + Brand
   * Query: GET /?brand=Hewlett-Packard&mpn=7G8X9LA&lang=es
   */
  async searchProduct(
    brand: string,
    mpn: string,
  ): Promise<IcecatProductMatch | null> {
    if (!this.config.username || !this.config.password) {
      console.debug(
        `[IcecatApiAdapter] Credentials not set. Skipping search for ${brand} | ${mpn}`,
      );
      return null;
    }

    try {
      const params = new URLSearchParams({
        brand,
        mpn,
        lang: this.config.language!,
      });

      const auth = Buffer.from(
        `${this.config.username}:${this.config.password}`,
      ).toString('base64');

      const url = `${this.baseUrl}/?${params}`;

      const response = await axios.get(url, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
        timeout: this.timeout,
      });

      if (!response.data) {
        return null;
      }

      // Parsear respuesta (Icecat devuelve XML o JSON según config)
      return this.parseResponse(response.data);
    } catch (err) {
      console.error(
        `[IcecatApiAdapter] Error searching for ${brand}|${mpn}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Parsear respuesta de Icecat (JSON esperado cuando responseType=json)
   */
  private parseResponse(data: any): IcecatProductMatch | null {
    try {
      // Estructura esperada de Icecat JSON response
      const info = data?.data || data;

      if (!info) {
        return null;
      }

      const generalInfo = info.GeneralInfo || info.general_info || {};
      const features = info.ProductFeature || info.product_feature || [];
      const multimedia =
        info.ProductMultimediaObject?.ProductMultimediaObject || [];

      const specs: Record<string, string | number> = {};
      for (const feature of Array.isArray(features) ? features : []) {
        const featureName = feature.Feature?.Name || feature.name;
        const featureValue = feature['@Value'] || feature.value;
        if (featureName && featureValue) {
          specs[featureName] = featureValue;
        }
      }

      const images = {
        thumb: multimedia[0]?.['@ThumbPic'] || multimedia[0]?.thumb_pic,
        large: multimedia[0]?.['@Pic'] || multimedia[0]?.pic,
        hd: multimedia[0]?.['@Pic500x500'] || multimedia[0]?.pic_500x500,
      };

      const result: any = {
        mpn: info.Product?.['@ID'] || info.mpn || '',
        brand: generalInfo.Brand?.['@Brand'] || generalInfo.brand || '',
        icecatId: info.Product?.['@ID'] || '',
        title: generalInfo.Title || generalInfo.title || '',
        description:
          generalInfo.Description?.LongDesc ||
          generalInfo.Description?.['LongDesc'] ||
          generalInfo.long_description ||
          '',
        datasheet: generalInfo.Datasheet || generalInfo.datasheet,
      };
      if (Object.keys(specs).length > 0) result.specs = specs;
      if (Object.values(images).some((v) => v)) result.images = images;
      return result;
    } catch (err) {
      let errorMsg = '';
      if (err instanceof Error) {
        errorMsg = err.message;
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        errorMsg = (err as any).message;
      } else {
        errorMsg = String(err);
      }
      console.error(
        `[IcecatApiAdapter] Error parsing Icecat response: ${errorMsg}`,
      );
      return null;
    }
  }

  /**
   * Validar credenciales (hacer test call simple)
   */
  async validateCredentials(): Promise<boolean> {
    try {
      // Test con un MPN conocido (ej. HP)
      const result = await this.searchProduct('Hewlett-Packard', 'test-mpn');
      return !!result || result === null; // null es OK, error sería false
    } catch {
      return false;
    }
  }

  /**
   * Actualizar configuración en runtime (cuando se cargan nuevas credenciales)
   */
  updateConfig(config: Partial<IcecatApiConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[IcecatApiAdapter] Config updated');
  }
}

/**
 * Crear instancia de adaptador desde ENV
 */
export function createIcecatAdapter(): IcecatApiAdapter {
  return new IcecatApiAdapter({
    username: process.env['ICECAT_USERNAME'] || '',
    password: process.env['ICECAT_PASSWORD'] || '',
    language: process.env['ICECAT_LANGUAGE'] || 'es',
    responseType: 'json',
  });
}
