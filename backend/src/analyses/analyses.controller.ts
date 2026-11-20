import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { PublicUser } from '../users/users.repository.js';
import { AnalysesService } from './analyses.service.js';
import {
  githubSchema,
  idSchema,
  listQuerySchema,
  pasteSchema,
  uploadFieldsSchema,
  type GithubInput,
  type ListQuery,
  type PasteInput,
  type UploadFields,
} from './analyses.schemas.js';

@Controller('analyses')
export class AnalysesController {
  constructor(private readonly analyses: AnalysesService) {}

  /** Analisa código colado no editor (um ou vários arquivos). */
  @Post('paste')
  @HttpCode(202)
  paste(
    @CurrentUser() user: PublicUser,
    @Body({ schema: pasteSchema }) body: PasteInput,
  ) {
    return this.analyses.fromPaste(user.id, body);
  }

  /** Analisa um projeto enviado como .zip (multipart/form-data, campo "file"). */
  @Post('upload')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: PublicUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body({ schema: uploadFieldsSchema }) fields: UploadFields,
  ) {
    return this.analyses.fromUpload(user.id, file, fields);
  }

  /** Analisa um repositório público do GitHub. */
  @Post('github')
  @HttpCode(202)
  github(
    @CurrentUser() user: PublicUser,
    @Body({ schema: githubSchema }) body: GithubInput,
  ) {
    return this.analyses.fromGithub(user.id, body);
  }

  @Get()
  list(
    @CurrentUser() user: PublicUser,
    @Query({ schema: listQuerySchema }) query: ListQuery,
  ) {
    return this.analyses.list(user.id, query.limit, query.cursor);
  }

  @Get(':id')
  get(
    @CurrentUser() user: PublicUser,
    @Param('id', { schema: idSchema }) id: string,
  ) {
    return this.analyses.get(user.id, id);
  }

  /** Download do relatório em Markdown (sempre como anexo, nunca renderizado). */
  @Get(':id/report')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  async report(
    @CurrentUser() user: PublicUser,
    @Param('id', { schema: idSchema }) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { title, reportMd } = await this.analyses.report(user.id, id);
    const slug =
      title
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\w-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 60) || 'relatorio';
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="explicacao-${slug}.md"`,
    );
    return new StreamableFile(Buffer.from(reportMd!, 'utf8'));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: PublicUser,
    @Param('id', { schema: idSchema }) id: string,
  ) {
    return this.analyses.remove(user.id, id);
  }
}
