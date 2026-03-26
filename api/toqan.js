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

    // PASSO 2: Aguardar processamento inicial (10 segundos)
    await new Promise(resolve => setTimeout(resolve, 10000));

    // PASSO 3: Buscar a resposta com timeout longo
    let attempts = 0;
    const maxAttempts = 120; // 120 segundos = 2 minutos
    let answerData = null;
    let lastAnswerLength = 0;
    let stableCount = 0;

    while (attempts < maxAttempts) {
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
        
        if (answerData.answer) {
          const currentLength = answerData.answer.length;
          
          // Verifica se a resposta estabilizou
          if (currentLength === lastAnswerLength && currentLength > 100) {
            stableCount++;
            if (stableCount >= 5) {
              // Resposta estável por 5 segundos
              break;
            }
          } else {
            stableCount = 0;
            lastAnswerLength = currentLength;
          }
          
          // Se status completed
          if (answerData.status === 'completed') {
            // Aguarda mais 5 segundos para garantir
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Busca uma última vez
            const finalResponse = await fetch(
              `https://api.toqan.ai/api/get_answer?conversation_id=${conversation_id}&request_id=${request_id}`,
              {
                method: 'GET',
                headers: {
                  'Accept': '*/*',
                  'X-Api-Key': process.env.TOQAN_API_KEY
                }
              }
            );
            
            if (finalResponse.ok) {
              answerData = await finalResponse.json();
            }
            break;
          }
        }
        
        if (answerData.status === 'failed') {
          return res.status(500).json({ 
            error: 'Falha ao processar resposta',
            details: answerData 
          });
        }
      }
      
      // Aguarda 1 segundo entre tentativas
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    // VALIDAÇÃO: Verifica se recebeu resposta
    if (!answerData) {
      return res.status(408).json({ 
        error: 'Timeout: nenhuma resposta recebida',
        conversation_id: conversation_id,
        request_id: request_id
      });
    }

    // DEBUG: Retorna dados brutos se answer estiver vazio
    if (!answerData.answer || answerData.answer.trim().length === 0) {
      return res.status(200).json({
        success: false,
        error: 'Resposta vazia do agente',
        debug: {
          status: answerData.status,
          raw_data: answerData,
          conversation_id: conversation_id,
          request_id: request_id
        }
      });
    }

    // PASSO 4: Processar a resposta
    let respostaFinal = answerData.answer;
    
    // Remove tags <think> se existirem
    const respostaSemThink = respostaFinal.replace(/<think>[\s\S]*?<\/think>/gi, '');
    
    // Se após remover <think> sobrou conteúdo, usa a versão limpa
    if (respostaSemThink.trim().length > 50) {
      respostaFinal = respostaSemThink;
    }
    
    // Remove frases introdutórias
