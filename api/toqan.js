export default async function handler(req, res) {
  // Só aceita requisições POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { message, conversation_id, request_id, action } = req.body;

  try {
    // AÇÃO 1: Criar nova conversa
    if (action === 'create' || (message && !conversation_id)) {
      if (!message) {
        return res.status(400).json({ error: 'Mensagem é obrigatória' });
      }

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
      return res.status(200).json({
        success: true,
        action: 'created',
        conversation_id: createData.conversation_id,
        request_id: createData.request_id
      });
    }

    // AÇÃO 2: Buscar resposta de conversa existente
    if (action === 'get_answer' && conversation_id && request_id) {
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

      if (!answerResponse.ok) {
        const errorData = await answerResponse.text();
        return res.status(answerResponse.status).json({ 
          error: 'Erro ao buscar resposta',
          details: errorData 
        });
      }

      const answerData = await answerResponse.json();

      // Se ainda está processando
      if (answerData.status === 'pending' || !answerData.answer) {
        return res.status(200).json({
          success: false,
          status: 'pending',
          message: 'Ainda processando...'
        });
      }

      // Se falhou
      if (answerData.status === 'failed') {
        return res.status(500).json({
          success: false,
          status: 'failed',
          error: 'Falha ao processar',
          details: answerData
        });
      }

      // Se completou
      if (answerData.status === 'completed' && answerData.answer) {
        let respostaLimpa = answerData.answer;
        
        // Remove tags <think>
        respostaLimpa = respostaLimpa.replace(/<think>[\s\S]*?<\/think>/gi, '');
        
        // Remove frases introdutórias se a resposta for longa
        if (respostaLimpa.length > 300) {
          respostaLimpa = respostaLimpa.replace(/^(Perfeito!|Vou analisar|Deixe-me|Aguarde).*?\n/gi, '');
          respostaLimpa = respostaLimpa.replace(/Deixe-me (verificar|consultar|analisar).*?\n/gi, '');
        }
        
        respostaLimpa = respostaLimpa.trim();

        return res.status(200).json({
          success: true,
          status: 'completed',
          message: respostaLimpa,
          original_length: answerData.answer.length,
          final_length: respostaLimpa.length
        });
      }

      // Status desconhecido
      return res.status(200).json({
        success: false,
        status: answerData.status || 'unknown',
        raw_data: answerData
      });
    }

    // Ação inválida
    return res.status(400).json({ 
      error: 'Ação inválida. Use action: "create" ou "get_answer"' 
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Erro interno',
      details: error.message
    });
  }
}
