import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

interface IcecatProduct {
  GeneralInfo?: {
    Title?: string;
    Description?: {
      LongDesc?: string;
    };
    Brand?: string;
    ProductMultimediaObject?: {
      ProductMultimediaObject?: Array<{
        '@Pic500x500': string;
        '@Pic': string;
        '@ThumbPic': string;
      }>;
    };
  };
  ProductFeature?: Array<{
    Feature: {
      Name: string;
    };
    '@Value': string;
  }>;
}

@Injectable()
export class IcecatService {
  private readonly logger = new Logger(IcecatService.name);
  private readonly apiUrl = 'https://live.icecat.biz/api';

  private readonly credentials = {
    username: process.env['ICECAT_USERNAME'] || '',
    password: process.env['ICECAT_PASSWORD'] || '',
  };

  /**
   * Busca un producto en Icecat por SKU/EAN
   */
  async searchProduct(
    ean: string,
    brand?: string,
  ): Promise<IcecatProduct | null> {
    if (!this.credentials.username || !this.credentials.password) {
      this.logger.warn('Credenciales de Icecat no configuradas');
      return null;
    }

    try {
      const auth = Buffer.from(
        `${this.credentials.username}:${this.credentials.password}`,
      ).toString('base64');

      const url = brand
        ? `${this.apiUrl}/?ean=${ean}&brand=${encodeURIComponent(brand)}&lang=es`
        : `${this.apiUrl}/?ean=${ean}&lang=es`;

      const response = await axios.get(url, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
        timeout: 10000,
      });

      return response.data?.data;
    } catch (error) {
      let errorMsg = '';
      if (error instanceof Error) {
        errorMsg = error.message;
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMsg = (error as any).message;
      } else {
        errorMsg = String(error);
      }
      this.logger.error(
        `Error buscando en Icecat (EAN: ${ean}): ${errorMsg}`,
      );
      return null;
    }
  }

  /**
   * Enriquece los datos de un producto con información de Icecat
   */
  async enrichProduct(
    sku: string,
    ean: string | null,
    upc: string | null,
    brand?: string,
  ): Promise<{
    description?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    specifications?: any;
    icecatId?: string;
  } | null> {
    try {
      // Priorizar EAN, luego UPC, finalmente SKU
      const searchCode = ean || upc || sku;
      
      if (!searchCode) {
        this.logger.warn(`No se encontró código de búsqueda para SKU ${sku}`);
        return null;
      }

      this.logger.log(`Buscando en Icecat: ${searchCode} (${brand || 'sin marca'})`);
      const icecatData = await this.searchProduct(searchCode, brand);

      if (!icecatData) {
        return null;
      }

      // Extraer imágenes
      const images =
        icecatData.GeneralInfo?.ProductMultimediaObject
          ?.ProductMultimediaObject;
      const mainImage = images?.[0];

      // Extraer especificaciones técnicas
      const specifications = icecatData.ProductFeature?.reduce(
        (acc, feature) => {
          if (feature.Feature?.Name && feature['@Value']) {
            acc[feature.Feature.Name] = feature['@Value'];
          }
          return acc;
        },
        {} as Record<string, string>,
      );

      return {
        ...((icecatData.GeneralInfo?.Description?.LongDesc || icecatData.GeneralInfo?.Title) && {
          description: icecatData.GeneralInfo?.Description?.LongDesc || icecatData.GeneralInfo?.Title
        }),
        ...(mainImage?.['@Pic500x500'] && { imageUrl: mainImage['@Pic500x500'] }),
        ...(mainImage?.['@ThumbPic'] && { thumbnailUrl: mainImage['@ThumbPic'] }),
        ...(specifications && Object.keys(specifications).length > 0 && { specifications }),
        icecatId: sku,
      };
    } catch (error) {
      let errorMsg = '';
      if (error instanceof Error) {
        errorMsg = error.message;
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMsg = (error as any).message;
      } else {
        errorMsg = String(error);
      }
      this.logger.error(
        `Error enriqueciendo producto ${sku}: ${errorMsg}`,
      );
      return null;
    }
  }

  /**
   * Actualiza configuración de credenciales
   */
  setCredentials(username: string, password: string) {
    this.credentials.username = username;
    this.credentials.password = password;
  }
}
