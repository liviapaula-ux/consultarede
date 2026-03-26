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
    let lastAnswer = '';
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
          const currentAnswer = answerData.answer;
          
          // Verifica se a resposta estabilizou (não mudou por 5 segundos)
          if (currentAnswer === lastAnswer && currentAnswer.length > 300) {
            stableCount++;
            if (stableCount >= 5) {
              // Resposta estável por 5 segundos
              break;
            }
          } else {
            stableCount = 0;
            lastAnswer = currentAnswer;
          }
          
          // Se status completed E tem conteúdo com listas/dados
          if (answerData.status === 'completed' && 
              (currentAnswer.includes('\n1 
