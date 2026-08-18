export interface ExtractedQuestion {
  id: string;
  questionNumber: number;
  question: string;
  correctAnswer: string;
  userAnswer?: string;
  wasCorrectInSimulator?: boolean;
  sourceFile: string;
  subject?: string;
}

export function parseQuizHtml(htmlContent: string, fileName: string): ExtractedQuestion[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const extracted: ExtractedQuestion[] = [];

  // Strategy 1: EcuadorPreguntas / CACES Simulator format (.results-list or li.list-group-item)
  const ecuadorItems = doc.querySelectorAll('li.list-group-item');
  if (ecuadorItems.length > 0) {
    let qCounter = 1;
    ecuadorItems.forEach((li) => {
      const isCorrectItem = li.classList.contains('correct') || li.classList.contains('list-group-item-success');
      const isIncorrectItem = li.classList.contains('incorrect') || li.classList.contains('list-group-item-danger');

      if (!isCorrectItem && !isIncorrectItem) return;

      // Extract question text
      let questionText = '';
      const fullQ = li.querySelector('.full-question');
      if (fullQ && fullQ.textContent) {
        questionText = fullQ.textContent.trim();
      } else {
        const strong = li.querySelector('.collapsed-question strong');
        if (strong && strong.textContent) {
          questionText = strong.textContent.trim();
        }
      }

      // Extract answers from inner elements
      const containerText = li.textContent || '';
      let correctAnswerText = '';
      let userAnswerText = '';

      const emElements = li.querySelectorAll('em');
      emElements.forEach((em) => {
        const labelText = (em.textContent || '').trim().toLowerCase();
        if (labelText.includes('respuesta correcta')) {
          // Look for text node right after em or parent content
          let nextNode = em.nextSibling;
          let text = '';
          while (nextNode) {
            if (nextNode.nodeType === Node.TEXT_NODE) {
              text += nextNode.textContent;
            } else if (nextNode.nodeType === Node.ELEMENT_NODE && (nextNode as HTMLElement).tagName !== 'BR') {
              text += nextNode.textContent;
            }
            nextNode = nextNode.nextSibling;
          }
          if (!text && em.parentElement) {
            const raw = em.parentElement.textContent || '';
            const match = raw.match(/Respuesta correcta:\s*([^\n\r]+)/i);
            if (match) text = match[1];
          }
          correctAnswerText = cleanText(text);
        } else if (labelText.includes('tu respuesta')) {
          let nextNode = em.nextSibling;
          let text = '';
          while (nextNode) {
            if (nextNode.nodeType === Node.TEXT_NODE) {
              text += nextNode.textContent;
            } else if (nextNode.nodeType === Node.ELEMENT_NODE && (nextNode as HTMLElement).tagName !== 'BR') {
              text += nextNode.textContent;
            }
            nextNode = nextNode.nextSibling;
          }
          if (!text && em.parentElement) {
            const raw = em.parentElement.textContent || '';
            const match = raw.match(/Tu respuesta:\s*([^\n\r]+)/i);
            if (match) text = match[1];
          }
          userAnswerText = cleanText(text);
        }
      });

      // Regex fallbacks if em search failed
      if (!correctAnswerText) {
        const rightMatch = containerText.match(/Respuesta correcta:\s*([^\n\r<]+)/i);
        if (rightMatch) {
          correctAnswerText = cleanText(rightMatch[1]);
        }
      }

      if (!userAnswerText) {
        const userMatch = containerText.match(/Tu respuesta:\s*([^\n\r<]+)/i);
        if (userMatch) {
          userAnswerText = cleanText(userMatch[1]);
        }
      }

      // If answered correctly in simulator, "Tu respuesta" IS the correct answer
      if (isCorrectItem && (!correctAnswerText || correctAnswerText === userAnswerText)) {
        correctAnswerText = userAnswerText;
      }

      // Cleanup
      questionText = cleanText(questionText);

      if (questionText && correctAnswerText) {
        extracted.push({
          id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          questionNumber: qCounter++,
          question: questionText,
          correctAnswer: correctAnswerText,
          userAnswer: userAnswerText,
          wasCorrectInSimulator: isCorrectItem,
          sourceFile: fileName
        });
      }
    });

    if (extracted.length > 0) {
      return extracted;
    }
  }

  // Strategy 2: Standard Moodle Quiz Review format (.que)
  const moodleQuestions = doc.querySelectorAll('.que');
  if (moodleQuestions.length > 0) {
    let qCounter = 1;
    moodleQuestions.forEach((qEl) => {
      const qTextEl = qEl.querySelector('.qtext, .questiontext');
      const rightAnsEl = qEl.querySelector('.rightanswer');

      const questionText = cleanText(qTextEl?.textContent || '');
      let correctAnswerText = '';

      if (rightAnsEl) {
        correctAnswerText = cleanText(rightAnsEl.textContent?.replace(/La respuesta correcta es:\s*/i, '').replace(/Correct answer:\s*/i, '') || '');
      }

      if (!correctAnswerText) {
        const correctChoice = qEl.querySelector('.answer .correct .text, .answer .correct');
        if (correctChoice) {
          correctAnswerText = cleanText(correctChoice.textContent || '');
        }
      }

      if (questionText && correctAnswerText) {
        extracted.push({
          id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          questionNumber: qCounter++,
          question: questionText,
          correctAnswer: correctAnswerText,
          sourceFile: fileName
        });
      }
    });

    if (extracted.length > 0) {
      return extracted;
    }
  }

  // Strategy 3: Generic DOM Scraper fallback
  const allElements = doc.body ? doc.body.querySelectorAll('p, div, li, article') : [];
  let qCounter = 1;
  allElements.forEach((el) => {
    const text = el.textContent || '';
    if (text.includes('Respuesta correcta:') || text.includes('Tu respuesta:')) {
      const prev = el.previousElementSibling;
      const questionText = cleanText(prev?.textContent || '');

      let correctAnswer = '';
      const rightMatch = text.match(/Respuesta correcta:\s*([^\n\r]+)/i);
      if (rightMatch) {
        correctAnswer = cleanText(rightMatch[1]);
      } else {
        const userMatch = text.match(/Tu respuesta:\s*([^\n\r]+)/i);
        if (userMatch) correctAnswer = cleanText(userMatch[1]);
      }

      if (questionText.length > 10 && correctAnswer) {
        if (!extracted.some((q) => q.question === questionText)) {
          extracted.push({
            id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            questionNumber: qCounter++,
            question: questionText,
            correctAnswer: correctAnswer,
            sourceFile: fileName
          });
        }
      }
    }
  });

  return extracted;
}

export function cleanText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/^Tu respuesta:\s*/i, '')
    .replace(/^Respuesta correcta:\s*/i, '')
    .replace(/Haz clic para ver más/g, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}
