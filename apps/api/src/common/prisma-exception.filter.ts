import { ArgumentsHost, BadRequestException, Catch, ConflictException, HttpException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/**
 * Yakalanmamış Prisma hatalarını anlamlı HTTP yanıtlarına çevirir (aksi halde her biri 500 olurdu):
 * P2002 benzersizlik → 409, P2003 yabancı anahtar → 400, P2025 kayıt yok → 404. Diğerleri 500 + sunucu günlüğü.
 * Yalnızca HTTP içindir. Nest 10 genel (global) filtreleri ws ağ geçitlerine uygulamaz; yine de başka bağlamda çağrılırsa
 * hata dokunulmadan yeniden fırlatılır.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw e;
    super.catch(this.map(e), host);
  }

  private map(e: Prisma.PrismaClientKnownRequestError): HttpException {
    switch (e.code) {
      case 'P2002': return new ConflictException('Bu kayıt zaten var');
      case 'P2003': return new BadRequestException('İlişkili kayıt bulunamadı');
      case 'P2025': return new NotFoundException('Kayıt bulunamadı');
      default:
        // Ayrıntı (tablo/kolon adları) istemciye sızmasın; yalnızca günlüğe yazılır.
        console.error(`Prisma hatası ${e.code}`, e);
        return new InternalServerErrorException();
    }
  }
}
