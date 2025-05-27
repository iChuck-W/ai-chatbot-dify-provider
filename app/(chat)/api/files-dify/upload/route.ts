import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';

export async function POST(request: Request) {
  try {

    const session = await auth();

    if (!session || !session.user || !session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      const user = formData.get('user') as string || session.user.id;

      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: '请求中未找到文件' },
          { status: 400 }
        );
      }

      try {
        
        const difyFormData = new FormData();
        difyFormData.append('file', file);
        difyFormData.append('user', user);

        const difyResponse = await fetch('https://api.dify.ai/v1/files/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
          },
          body: difyFormData,
        });

        if (!difyResponse.ok) {
          const error = await difyResponse.json();
          return NextResponse.json(
            { error: error.message || '上传到 Dify 失败' },
            { status: difyResponse.status }
          );
        }

        const difyFileData = await difyResponse.json();
        // console.log('difyFileData', difyFileData);
        return NextResponse.json(difyFileData);
      } catch (error) {
        return NextResponse.json(
          { error: '上传文件失败' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: '不支持的内容类型' },
      { status: 415 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
