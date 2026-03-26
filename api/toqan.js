export default async function handler(req, res) {
  // Só aceita requisições POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Pega a mensagem enviada do frontend
  const { message } = req.body;

  // Valida se a mensagem foi enviada
  if (!message) {
    return res.status(400).json({ error: 'Mensagem é obrigatória' });
  }

  try {
    // PASSO 1: Criar a conversa
    const createResponse = await fetch('https://api.toqan.ai/api/create_conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'X-Api-Key': process.env.TOQAN_API_KEY
      },
      body: JSON.stringify({
        user_message: message
      })
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.text();
      return res.status(createResponse.status).json({ 
        error: 'Erro ao criar conversa',
        details: errorData 
      });
    }

    const createData = await createResponse.json();
    const { conversation_id, request_id } = createData;

    // PASSO 2: Buscar a resposta (com retry)
    let attempts = 0;
    const maxAttempts = 30; // Tenta por até 30 segundos
    let answerData = null;

    while (attempts < maxAttempts) {
      // Aguarda 1 segundo entre tentativas
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const answerResponse = await fetch(
        `https://api.toqan.ai/api/get_answer?conversation_id=${conversation_id}&request_id=${request_id}`,
        {
          method: 'GET',
          headers: {
            'Accept': '*/*',
            'X-Api-Key': process.env.TOQAN_API_KEY
          }
        }
      );

      if (answerResponse.ok) {
        answerData = await answerResponse.json();
        
        // Verifica se a resposta está pronta
        if (answerData.status === 'completed' && answerData.answer) {
          break;
        } else if (answerData.status === 'failed') {
          return res.status(500).json({ 
            error: 'Falha ao processar resposta',
            details: answerData 
          });
        }
      }
      
      attempts++;
    }

    if (!answerData || !answerData.answer) {
      return res.status(408).json({ 
        error: 'Timeout: resposta não recebida a tempo',
        details: answerData 
      });
    }

    // PASSO 3: Limpar a resposta (remover reasoning)
    let respostaLimpa = answerData.answer;
    
    // Remove tags <think>...</think> (reasoning)
    respostaLimpa = respostaLimpa.replace(/<think>[\s\S]*?<\/think>/gi, '');
    
    // Remove espaços extras no início
    respostaLimpa = respostaLimpa.trim();

    // PASSO 4: Retornar a resposta formatada
    return res.status(200).json({
      success: true,
      message: respostaLimpa,
      conversation_id: conversation_id,
      request_id: request_id,
      status: answerData.status
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Erro interno',
      details: error.message 
    });
  }
}
