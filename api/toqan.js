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

    // PASSO 2: Aguardar processamento inicial (5 segundos)
    await new Promise(resolve => setTimeout(resolve, 5000));

    // PASSO 3: Buscar a resposta (com retry e validação)
    let attempts = 0;
    const maxAttempts = 60; // Aumenta para 60 tentativas (60 segundos)
    let answerData = null;
    let previousAnswerLength = 0;
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
        
        // Verifica se tem resposta
        if (answerData.answer) {
          const currentLength = answerData.answer.length;
          
          // Se a resposta parou de crescer por 3 verificações consecutivas, considera completa
          if (currentLength === previousAnswerLength) {
            stableCount++;
            if (stableCount >= 3 && currentLength > 100) {
              // Resposta estável e com conteúdo suficiente
              break;
            }
          } else {
            stableCount = 0;
            previousAnswerLength = currentLength;
          }
          
          // Se status for completed E resposta tiver conteúdo substancial
          if (answerData.status === 'completed' && currentLength > 200) {
            break;
          }
        }
        
        if (answerData.status === 'failed') {
          return res.status
